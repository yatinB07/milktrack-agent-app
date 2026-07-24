import {
  createAgentRouteSync,
  fetchAgentRouteAssignmentPage,
  fetchAgentScheduledDeliveryPage,
  type AgentDataRequest,
  type AgentRouteAssignmentPage,
  type AgentScheduledDeliveryPage,
} from '@/agent/api';
import {
  projectCachedTodayRoute,
  projectTodayRoute,
  RouteDataUnavailableError,
  type TodayRoute,
} from '@/agent/model';
import { parseRouteLease, systemClock, type Clock } from './clock';
import {
  getRouteSnapshot,
  replaceRouteSnapshot,
  type RouteSnapshot,
} from './route-store';
import type { CachedAssignment, VendorRouteScope } from './types';

type RouteRefreshRequest = AgentDataRequest &
  VendorRouteScope &
  Readonly<{ db: Parameters<typeof getRouteSnapshot>[0] }>;

export type RefreshedRouteSnapshot = Readonly<{
  snapshot: RouteSnapshot;
  model: TodayRoute;
}>;

/** Replaces a route only after every page and the matching lease validate. */
export async function refreshRouteSnapshot(
  request: RouteRefreshRequest,
  clock: Clock = systemClock,
): Promise<RefreshedRouteSnapshot> {
  const scope = {
    actorId: request.actorId,
    vendorId: request.vendorId,
    deviceId: request.deviceId,
  };
  const { assignments, serviceDate } = await drainAssignments(request);
  const deliveries = await drainDeliveries(request, serviceDate, assignments);
  projectTodayRoute({
    assignmentPages: [{ serviceDate, items: assignments }],
    deliveryPages: [{ serviceDate, items: deliveries }],
  });

  const routes = assignments.map(({ id, routeId, routeVersion }) => ({
    routeAssignmentId: id,
    routeId,
    routeVersion,
  }));
  validateRouteVersions(routes);
  const sync = await createAgentRouteSync({
    vendorId: request.vendorId,
    accessToken: request.accessToken,
    serviceDate,
    routes,
  });
  if (!sync.routeSyncId) invalid();
  validateRouteVersionSet(routes, sync.routes);

  const savedAtWallMs = clock();
  const lease = parseRouteLease(sync.serverTime, sync.expiresAt, savedAtWallMs);
  await replaceRouteSnapshot(request.db, {
    ...scope,
    serviceDate,
    routeSyncId: sync.routeSyncId,
    lease,
    route: {
      assignments: assignments.map(omitAuditTimestamps),
      deliveries,
    },
  });

  const snapshot = await getRouteSnapshot(request.db, scope);
  if (!snapshot) throw new RouteDataUnavailableError('Persisted route unavailable');
  return {
    snapshot,
    model: projectCachedTodayRoute(snapshot.route, snapshot.serviceDate),
  };
}

async function drainAssignments(request: RouteRefreshRequest) {
  const first = await fetchAgentRouteAssignmentPage(request);
  const serviceDate = first.serviceDate;
  if (!serviceDate) invalid();
  const items: AgentRouteAssignmentPage['items'] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let page = first;

  while (true) {
    if (page.serviceDate !== serviceDate) invalid();
    for (const item of page.items) {
      if (item.serviceDate !== serviceDate || ids.has(item.id)) invalid();
      ids.add(item.id);
      items.push(item);
    }
    if (page.nextCursor === undefined) return { assignments: items, serviceDate };
    validateCursor(page.nextCursor, cursors);
    page = await fetchAgentRouteAssignmentPage({
      vendorId: request.vendorId,
      accessToken: request.accessToken,
      serviceDate,
      cursor: page.nextCursor,
    });
  }
}

async function drainDeliveries(
  request: RouteRefreshRequest,
  serviceDate: string,
  assignments: AgentRouteAssignmentPage['items'],
) {
  const assignmentRoutes = new Map(assignments.map(({ id, routeId }) => [id, routeId]));
  const items: AgentScheduledDeliveryPage['items'] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let page = await fetchAgentScheduledDeliveryPage({
    vendorId: request.vendorId,
    accessToken: request.accessToken,
    serviceDate,
  });

  while (true) {
    if (page.serviceDate !== serviceDate) invalid();
    for (const item of page.items) {
      if (
        item.serviceDate !== serviceDate
        || ids.has(item.id)
        || assignmentRoutes.get(item.routeAssignmentId) !== item.routeId
      ) invalid();
      ids.add(item.id);
      items.push(item);
    }
    if (page.nextCursor === undefined) return items;
    validateCursor(page.nextCursor, cursors);
    page = await fetchAgentScheduledDeliveryPage({
      vendorId: request.vendorId,
      accessToken: request.accessToken,
      serviceDate,
      cursor: page.nextCursor,
    });
  }
}

function validateCursor(cursor: string, seen: Set<string>) {
  if (!cursor || seen.has(cursor)) invalid();
  seen.add(cursor);
}

function validateRouteVersions(
  routes: readonly Readonly<{
    routeAssignmentId: string;
    routeId: string;
    routeVersion: number;
  }>[],
) {
  if (routes.some(({ routeAssignmentId, routeId, routeVersion }) =>
    !routeAssignmentId || !routeId || !Number.isSafeInteger(routeVersion))) invalid();
}

function validateRouteVersionSet(
  expected: readonly Readonly<{
    routeAssignmentId: string;
    routeId: string;
    routeVersion: number;
  }>[],
  actual: readonly Readonly<{
    routeAssignmentId: string;
    routeId: string;
    routeVersion: number;
  }>[],
) {
  validateRouteVersions(actual);
  const key = ({ routeAssignmentId, routeId, routeVersion }: (typeof expected)[number]) =>
    JSON.stringify([routeAssignmentId, routeId, routeVersion]);
  const expectedKeys = expected.map(key).sort();
  const actualKeys = actual.map(key).sort();
  if (
    expectedKeys.length !== actualKeys.length
    || expectedKeys.some((value, index) => value !== actualKeys[index])
  ) invalid();
}

function omitAuditTimestamps({
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  ...assignment
}: AgentRouteAssignmentPage['items'][number]): CachedAssignment {
  return assignment;
}

function invalid(): never {
  throw new RouteDataUnavailableError('Route data unavailable');
}

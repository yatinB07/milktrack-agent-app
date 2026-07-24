import type { AgentRouteAssignmentPage, AgentScheduledDeliveryPage } from './api';
import type { CachedRoutePayload } from '@/offline/types';

type Assignment = Omit<AgentRouteAssignmentPage['items'][number], 'createdAt' | 'updatedAt'>;
type Delivery = AgentScheduledDeliveryPage['items'][number];
type AssignmentPage = Readonly<{
  serviceDate: string;
  items: readonly Assignment[];
  nextCursor?: string;
}>;
type DeliveryPage = Readonly<{
  serviceDate: string;
  items: readonly Delivery[];
  nextCursor?: string;
}>;

export class RouteDataUnavailableError extends Error {}

export type TodayRouteStop = Readonly<{
  routeStopId: string;
  sequence: number;
  products: readonly Delivery[];
  pendingProducts: readonly (Delivery['pendingStopItems'][number])[];
  completedProducts: readonly Delivery[];
  blockedByCustomerLeave: boolean;
  captureLocationEvidence: boolean;
  currentOutcome?: Delivery['currentStatus'];
}>;

export type TodayRouteAssignment = Readonly<{
  assignment: Assignment;
  stops: readonly TodayRouteStop[];
}>;

export type TodayRoute = Readonly<{
  serviceDate?: string;
  assignments: readonly TodayRouteAssignment[];
  unmatchedDeliveryIds: readonly string[];
  hasMoreAssignments: boolean;
  hasMoreDeliveries: boolean;
}>;

export function projectTodayRoute({
  assignmentPages,
  deliveryPages,
}: Readonly<{
  assignmentPages: readonly AssignmentPage[];
  deliveryPages: readonly DeliveryPage[];
}>): TodayRoute {
  const assignments = new Map<string, Assignment>();
  for (const page of assignmentPages) {
    for (const assignment of page.items) {
      if (!assignments.has(assignment.id)) assignments.set(assignment.id, assignment);
    }
  }

  const deliveries = new Map<string, Delivery>();
  for (const page of deliveryPages) {
    for (const delivery of page.items) {
      if (!deliveries.has(delivery.id)) deliveries.set(delivery.id, delivery);
    }
  }

  const matched = new Map<string, Delivery[]>();
  const unmatchedDeliveryIds: string[] = [];
  for (const delivery of deliveries.values()) {
    if (!assignments.has(delivery.routeAssignmentId)) {
      unmatchedDeliveryIds.push(delivery.id);
      continue;
    }
    const group = matched.get(delivery.routeAssignmentId) ?? [];
    group.push(delivery);
    matched.set(delivery.routeAssignmentId, group);
  }

  const projected = [...assignments.values()].map((assignment) => ({
    assignment,
    stops: stops(matched.get(assignment.id) ?? []),
  }));
  const serviceDate = assignmentPages[0]?.serviceDate ?? deliveryPages[0]?.serviceDate;

  return {
    ...(serviceDate ? { serviceDate } : {}),
    assignments: projected,
    unmatchedDeliveryIds,
    hasMoreAssignments: assignmentPages.at(-1)?.nextCursor !== undefined,
    hasMoreDeliveries: deliveryPages.at(-1)?.nextCursor !== undefined,
  };
}

export function projectCachedTodayRoute(
  route: CachedRoutePayload,
  serviceDate: string,
): TodayRoute {
  return projectTodayRoute({
    assignmentPages: [{ serviceDate, items: route.assignments }],
    deliveryPages: [{ serviceDate, items: route.deliveries }],
  });
}

export function findTodayRouteStop(route: TodayRoute, routeStopId: string) {
  for (const assignment of route.assignments) {
    const stop = assignment.stops.find((candidate) => candidate.routeStopId === routeStopId);
    if (stop) return stop;
  }
  return undefined;
}

function stops(deliveries: readonly Delivery[]): TodayRouteStop[] {
  const grouped = new Map<string, { sequence: number; products: Delivery[] }>();
  for (const delivery of deliveries) {
    const stop = grouped.get(delivery.routeStopId) ?? { sequence: delivery.sequence, products: [] };
    stop.products.push(delivery);
    grouped.set(delivery.routeStopId, stop);
  }
  return [...grouped].map(([routeStopId, stop]) => {
    const products = stop.products.sort((left, right) => left.id.localeCompare(right.id));
    const pendingProducts = products[0]!.pendingStopItems;
    const pendingSignature = JSON.stringify(pendingProducts);
    if (products.some((product) => JSON.stringify(product.pendingStopItems) !== pendingSignature)) {
      throw new RouteDataUnavailableError('Route data unavailable');
    }
    const completedProducts = products.filter((product) => product.currentStatus !== 'scheduled');
    return {
      routeStopId,
      sequence: stop.sequence,
      products,
      pendingProducts,
      completedProducts,
      blockedByCustomerLeave: products.some((product) => product.blockedByCustomerLeave),
      captureLocationEvidence: products[0]!.captureLocationEvidence,
      ...(completedProducts[0] ? { currentOutcome: completedProducts[0].currentStatus } : {}),
    };
  }).sort((left, right) => left.sequence - right.sequence || left.routeStopId.localeCompare(right.routeStopId));
}

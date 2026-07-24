import * as agentApi from '@/agent/api';
import * as routeStore from '../route-store';
import { refreshRouteSnapshot } from '../route-refresh';

jest.mock('@/agent/api', () => ({
  ...jest.requireActual('@/agent/api'),
  createAgentRouteSync: jest.fn(),
  fetchAgentRouteAssignmentPage: jest.fn(),
  fetchAgentScheduledDeliveryPage: jest.fn(),
}));
jest.mock('../route-store', () => ({
  getRouteSnapshot: jest.fn(),
  replaceRouteSnapshot: jest.fn(),
}));

const request = {
  actorId: 'actor-1',
  vendorId: 'vendor-1',
  deviceId: 'device-1',
  accessToken: 'access-token',
  db: {} as Parameters<typeof routeStore.getRouteSnapshot>[0],
};
const serviceDate = '2026-07-24';

const assignment = (id: string, routeVersion: number) => ({
  id,
  routeId: `route-${id}`,
  routeVersion,
  deliverySlotId: `slot-${id}`,
  agentMembershipId: 'agent-1',
  serviceDate,
  status: 'assigned' as const,
  createdAt: `${serviceDate}T00:00:00.000Z`,
  updatedAt: `${serviceDate}T00:00:00.000Z`,
  routeCode: id.toUpperCase(),
  routeName: `Route ${id}`,
  deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00',
  deliverySlotEndLocalTime: '09:00',
});

const delivery = (id: string, routeAssignmentId: string) => ({
  id,
  routeAssignmentId,
  routeStopId: `stop-${id}`,
  sequence: 1,
  routeId: `route-${routeAssignmentId}`,
  serviceDate,
  subscriptionId: `subscription-${id}`,
  householdId: `household-${id}`,
  productId: `product-${id}`,
  unitId: 'unit-1',
  deliverySlotId: `slot-${routeAssignmentId}`,
  plannedQuantity: '1',
  routeCode: routeAssignmentId.toUpperCase(),
  routeName: `Route ${routeAssignmentId}`,
  householdAccountNumber: `H-${id}`,
  householdName: `Household ${id}`,
  addressLine1: '1 Test Road',
  city: 'Pune',
  region: 'MH',
  postalCode: '411001',
  countryCode: 'IN',
  productCode: id.toUpperCase(),
  productName: `Product ${id}`,
  unitCode: 'L',
  unitName: 'Litre',
  deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00',
  deliverySlotEndLocalTime: '09:00',
  currentStatus: 'scheduled' as const,
  version: 1,
  blockedByCustomerLeave: false,
  captureLocationEvidence: false,
  pendingStopItems: [{
    scheduledDeliveryId: id,
    expectedVersion: 1,
    plannedQuantity: '1',
    productName: `Product ${id}`,
    unitName: 'Litre',
  }],
});

beforeEach(() => jest.clearAllMocks());

test('drains the complete route, validates its lease, and returns the persisted projection', async () => {
  const assignments = [assignment('a', 3), assignment('b', 4)];
  const deliveries = [delivery('milk', 'a'), delivery('curd', 'b')];
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce({ serviceDate, items: [assignments[0]!], nextCursor: 'assignment-2' })
    .mockResolvedValueOnce({ serviceDate, items: [assignments[1]!] });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce({ serviceDate, items: [deliveries[0]!], nextCursor: 'delivery-2' })
    .mockResolvedValueOnce({ serviceDate, items: [deliveries[1]!] });
  jest.mocked(agentApi.createAgentRouteSync).mockResolvedValue({
    routeSyncId: 'sync-1',
    serverTime: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: assignments.map(({ id, routeId, routeVersion }) => ({
      routeAssignmentId: id,
      routeId,
      routeVersion,
    })),
  });
  jest.mocked(routeStore.getRouteSnapshot).mockImplementation(async (_db, scope) => ({
    ...scope,
    serviceDate,
    routeSyncId: 'sync-1',
    lease: {
      serverTimeMs: Date.parse('2026-07-24T00:00:00.000Z'),
      expiresAtMs: Date.parse('2026-07-25T00:00:00.000Z'),
      savedAtWallMs: 123,
      retentionDeleteAfterWallMs: 86_400_123,
    },
    route: {
      assignments: assignments.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...item }) => item),
      deliveries,
    },
  }));

  const result = await refreshRouteSnapshot(request, () => 123);

  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenNthCalledWith(2, {
    vendorId: request.vendorId,
    accessToken: request.accessToken,
    serviceDate,
    cursor: 'assignment-2',
  });
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenNthCalledWith(2, {
    vendorId: request.vendorId,
    accessToken: request.accessToken,
    serviceDate,
    cursor: 'delivery-2',
  });
  expect(agentApi.createAgentRouteSync).toHaveBeenCalledWith({
    vendorId: request.vendorId,
    accessToken: request.accessToken,
    serviceDate,
    routes: [
      { routeAssignmentId: 'a', routeId: 'route-a', routeVersion: 3 },
      { routeAssignmentId: 'b', routeId: 'route-b', routeVersion: 4 },
    ],
  });
  expect(routeStore.replaceRouteSnapshot).toHaveBeenCalledTimes(1);
  expect(result.model.assignments.map(({ assignment: item }) => item.id)).toEqual(['a', 'b']);
});

test.each([
  ['assignment page date', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
      .mockResolvedValueOnce({ serviceDate, items: [assignment('a', 1)], nextCursor: 'next' })
      .mockResolvedValueOnce({ serviceDate: '2026-07-25', items: [] });
  }],
  ['assignment item date', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
      serviceDate,
      items: [{ ...assignment('a', 1), serviceDate: '2026-07-25' }],
    });
  }],
  ['assignment repeated cursor', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
      .mockResolvedValueOnce({ serviceDate, items: [assignment('a', 1)], nextCursor: 'same' })
      .mockResolvedValueOnce({ serviceDate, items: [assignment('b', 1)], nextCursor: 'same' });
  }],
  ['assignment empty cursor', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
      serviceDate,
      items: [assignment('a', 1)],
      nextCursor: '',
    });
  }],
  ['assignment duplicate ID', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
      .mockResolvedValueOnce({ serviceDate, items: [assignment('a', 1)], nextCursor: 'next' })
      .mockResolvedValueOnce({ serviceDate, items: [assignment('a', 1)] });
  }],
] as const)('rejects an invalid %s before replacing the old snapshot', async (_case, arrange) => {
  arrange();

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('Route data unavailable');
  expect(agentApi.createAgentRouteSync).not.toHaveBeenCalled();
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test.each([
  ['delivery page date', {
    serviceDate: '2026-07-25',
    items: [delivery('milk', 'a')],
  }],
  ['delivery item date', {
    serviceDate,
    items: [{ ...delivery('milk', 'a'), serviceDate: '2026-07-25' }],
  }],
  ['delivery duplicate ID', {
    serviceDate,
    items: [delivery('milk', 'a'), delivery('milk', 'a')],
  }],
  ['orphan delivery assignment', {
    serviceDate,
    items: [delivery('milk', 'missing')],
  }],
  ['mismatched delivery route', {
    serviceDate,
    items: [{ ...delivery('milk', 'a'), routeId: 'another-route' }],
  }],
] as const)('rejects an invalid %s before acquiring a lease', async (_case, invalidPage) => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [assignment('a', 1)],
  });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue({
    ...invalidPage,
    items: [...invalidPage.items],
  });

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('Route data unavailable');
  expect(agentApi.createAgentRouteSync).not.toHaveBeenCalled();
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test('rejects a repeated delivery cursor without replacing the snapshot', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [assignment('a', 1)],
  });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce({ serviceDate, items: [], nextCursor: 'same' })
    .mockResolvedValueOnce({ serviceDate, items: [], nextCursor: 'same' });

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('Route data unavailable');
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test('rejects an empty delivery cursor without replacing the snapshot', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [assignment('a', 1)],
  });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue({
    serviceDate,
    items: [],
    nextCursor: '',
  });

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('Route data unavailable');
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test('retains the existing snapshot when stop items disagree within one stop', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [assignment('a', 1)],
  });
  const milk = delivery('milk', 'a');
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue({
    serviceDate,
    items: [
      milk,
      {
        ...delivery('curd', 'a'),
        routeStopId: milk.routeStopId,
        pendingStopItems: [],
      },
    ],
  });

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('Route data unavailable');
  expect(agentApi.createAgentRouteSync).not.toHaveBeenCalled();
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test.each([
  ['malformed server time', {
    serverTime: 'not-a-time',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [{ routeAssignmentId: 'a', routeId: 'route-a', routeVersion: 1 }],
  }],
  ['non-increasing expiry', {
    serverTime: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [{ routeAssignmentId: 'a', routeId: 'route-a', routeVersion: 1 }],
  }],
  ['route version mismatch', {
    serverTime: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [{ routeAssignmentId: 'a', routeId: 'route-a', routeVersion: 2 }],
  }],
  ['missing returned route', {
    serverTime: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [],
  }],
  ['missing route sync ID', {
    serverTime: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [{ routeAssignmentId: 'a', routeId: 'route-a', routeVersion: 1 }],
    routeSyncId: '',
  }],
] as const)('rejects a lease with %s and preserves the old snapshot', async (_case, response) => {
  mockSingleRoute();
  jest.mocked(agentApi.createAgentRouteSync).mockResolvedValue({
    routeSyncId: 'sync-1',
    ...response,
    routes: [...response.routes],
  });

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow();
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test.each([
  ['second assignment page', () => {
    jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
      .mockResolvedValueOnce({ serviceDate, items: [assignment('a', 1)], nextCursor: 'next' })
      .mockRejectedValueOnce(new Error('network detail'));
  }],
  ['lease request', () => {
    mockSingleRoute();
    jest.mocked(agentApi.createAgentRouteSync).mockRejectedValue(new Error('network detail'));
  }],
] as const)('preserves the old snapshot when the %s fails', async (_case, arrange) => {
  arrange();

  await expect(refreshRouteSnapshot(request, () => 123)).rejects.toThrow('network detail');
  expect(routeStore.replaceRouteSnapshot).not.toHaveBeenCalled();
});

test('persists a complete empty leased route', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [],
  });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue({
    serviceDate,
    items: [],
  });
  jest.mocked(agentApi.createAgentRouteSync).mockResolvedValue({
    routeSyncId: 'sync-empty',
    serverTime: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    routes: [],
  });
  jest.mocked(routeStore.getRouteSnapshot).mockResolvedValue({
    actorId: request.actorId,
    vendorId: request.vendorId,
    deviceId: request.deviceId,
    serviceDate,
    routeSyncId: 'sync-empty',
    lease: {
      serverTimeMs: Date.parse('2026-07-24T00:00:00.000Z'),
      expiresAtMs: Date.parse('2026-07-25T00:00:00.000Z'),
      savedAtWallMs: 123,
      retentionDeleteAfterWallMs: 86_400_123,
    },
    route: { assignments: [], deliveries: [] },
  });

  const result = await refreshRouteSnapshot(request, () => 123);

  expect(routeStore.replaceRouteSnapshot).toHaveBeenCalledWith(request.db, expect.objectContaining({
    route: { assignments: [], deliveries: [] },
  }));
  expect(result.model.assignments).toEqual([]);
});

function mockSingleRoute() {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue({
    serviceDate,
    items: [assignment('a', 1)],
  });
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue({
    serviceDate,
    items: [delivery('milk', 'a')],
  });
}

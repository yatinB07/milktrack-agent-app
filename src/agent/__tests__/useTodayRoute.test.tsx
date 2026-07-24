import { useNetInfo } from '@react-native-community/netinfo';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getOrCreateDeviceId } from '@/auth/storage';
import { refreshRouteSnapshot } from '@/offline/route-refresh';
import { getRouteSnapshot, type RouteSnapshot } from '@/offline/route-store';
import { useTodayRoute } from '../useTodayRoute';

jest.mock('@react-native-community/netinfo');
jest.mock('expo-sqlite', () => ({ useSQLiteContext: jest.fn() }));
jest.mock('@/auth/storage', () => ({ getOrCreateDeviceId: jest.fn() }));
jest.mock('@/offline/route-refresh', () => ({ refreshRouteSnapshot: jest.fn() }));
jest.mock('@/offline/route-store', () => ({
  getRouteSnapshot: jest.fn(),
}));

const db = {} as ReturnType<typeof useSQLiteContext>;
const request = {
  actorId: 'actor-1',
  vendorId: 'vendor-1',
  accessToken: 'access-token',
  accessMode: 'standard' as const,
};
const cachedAssignment = {
  id: 'assignment-1',
  routeId: 'route-1',
  routeVersion: 3,
  deliverySlotId: 'slot-1',
  agentMembershipId: 'agent-1',
  serviceDate: '2026-07-24',
  status: 'assigned' as const,
  routeCode: 'NORTH',
  routeName: 'North',
  deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00',
  deliverySlotEndLocalTime: '09:00',
};
const cachedDelivery = {
  id: 'delivery-1',
  routeAssignmentId: 'assignment-1',
  routeStopId: 'stop-1',
  sequence: 1,
  routeId: 'route-1',
  serviceDate: '2026-07-24',
  subscriptionId: 'subscription-1',
  householdId: 'household-1',
  productId: 'product-1',
  unitId: 'unit-1',
  deliverySlotId: 'slot-1',
  plannedQuantity: '1',
  routeCode: 'NORTH',
  routeName: 'North',
  householdAccountNumber: 'H-1',
  householdName: 'Household',
  addressLine1: '1 Test Road',
  city: 'Pune',
  region: 'MH',
  postalCode: '411001',
  countryCode: 'IN',
  productCode: 'MILK',
  productName: 'Milk',
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
    scheduledDeliveryId: 'delivery-1',
    expectedVersion: 1,
    plannedQuantity: '1',
    productName: 'Milk',
    unitName: 'Litre',
  }],
};

function snapshot(overrides: Partial<RouteSnapshot['lease']> = {}): RouteSnapshot {
  return {
    actorId: request.actorId,
    vendorId: request.vendorId,
    deviceId: 'device-1',
    serviceDate: '2026-07-24',
    routeSyncId: 'sync-1',
    lease: {
      serverTimeMs: 1_000,
      expiresAtMs: 2_000,
      savedAtWallMs: 10_000,
      retentionDeleteAfterWallMs: 11_000,
      ...overrides,
    },
    route: { assignments: [cachedAssignment], deliveries: [cachedDelivery] },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(10_500);
  jest.mocked(useSQLiteContext).mockReturnValue(db);
  jest.mocked(getOrCreateDeviceId).mockResolvedValue('device-1');
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: false } as ReturnType<typeof useNetInfo>);
});

afterEach(() => jest.restoreAllMocks());

test('renders the local snapshot first while offline without a network refresh', async () => {
  jest.mocked(getRouteSnapshot).mockResolvedValue(snapshot());

  const { result } = await renderHook(() => useTodayRoute(request));

  await waitFor(() => expect(result.current.status).toBe('success'));
  expect(result.current.freshness).toBe('fresh');
  expect(result.current.model?.assignments[0]?.stops[0]?.routeStopId).toBe('stop-1');
  expect(result.current.findStop('stop-1')?.routeStopId).toBe('stop-1');
  expect(result.current.lastRefreshedAt).toBe(10_000);
  expect(refreshRouteSnapshot).not.toHaveBeenCalled();
});

test('retains the local snapshot when an online refresh fails', async () => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true } as ReturnType<typeof useNetInfo>);
  jest.mocked(getRouteSnapshot).mockResolvedValue(snapshot());
  jest.mocked(refreshRouteSnapshot).mockRejectedValue(new Error('network detail'));

  const { result } = await renderHook(() => useTodayRoute(request));

  await waitFor(() => expect(result.current.errorKind).toBe('unavailable'));
  expect(result.current.status).toBe('success');
  expect(result.current.model?.assignments[0]?.assignment.id).toBe('assignment-1');
});

test.each([
  ['fresh', 10_999, 'fresh'],
  ['exact expiry', 11_000, 'stale'],
  ['clock rollback', 9_999, 'clock_rollback'],
] as const)('maps %s from persisted lease time', async (_case, now, expected) => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.mocked(getRouteSnapshot).mockResolvedValue(snapshot());

  const { result } = await renderHook(() => useTodayRoute(request));

  await waitFor(() => expect(result.current.freshness).toBe(expected));
});

test('reports an unavailable missing state when no snapshot can be refreshed', async () => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true } as ReturnType<typeof useNetInfo>);
  jest.mocked(getRouteSnapshot).mockResolvedValue(null);
  jest.mocked(refreshRouteSnapshot).mockRejectedValue(new Error('network detail'));

  const { result } = await renderHook(() => useTodayRoute(request));

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.freshness).toBe('missing');
  expect(result.current.errorKind).toBe('unavailable');
  expect(result.current.model).toBeUndefined();
});

test('offline recovery mode never reads or refreshes a route snapshot', async () => {
  const { result } = await renderHook(() => useTodayRoute({
    ...request,
    accessMode: 'offline_recovery',
  }));

  await waitFor(() => expect(result.current.freshness).toBe('missing'));
  expect(getOrCreateDeviceId).not.toHaveBeenCalled();
  expect(getRouteSnapshot).not.toHaveBeenCalled();
  expect(refreshRouteSnapshot).not.toHaveBeenCalled();
});

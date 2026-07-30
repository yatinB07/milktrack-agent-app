import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { useAuth } from '@/auth/AuthProvider';
import {
  useAgentSync,
  type OfflineActionView,
} from '@/offline/AgentSyncProvider';
import { RouteScreen } from '../RouteScreen';

jest.mock('expo-sqlite', () => ({ useSQLiteContext: jest.fn() }));
jest.mock('@/agent/useTodayRoute');
jest.mock('@/agent/AgentWorkspaceProvider');
jest.mock('@/auth/AuthProvider');
jest.mock('@/offline/AgentSyncProvider');
jest.mock('@react-native-community/netinfo');
jest.mock('@/components/ConnectivityBanner', () => {
  const { Text } = jest.requireActual('react-native');
  return { ConnectivityBanner: () => <Text>Connection status: Online</Text> };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const retrySession = jest.fn();
const clearVendor = jest.fn();
const refresh = jest.fn();
const assignment = {
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
const delivery = {
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
  householdName: 'Patel Home',
  addressLine1: '1 Market Road',
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
const model = {
  serviceDate: '2026-07-24',
  assignments: [{
    assignment,
    stops: [{
      routeStopId: 'stop-1',
      sequence: 1,
      products: [delivery],
      pendingProducts: delivery.pendingStopItems,
      completedProducts: [],
      blockedByCustomerLeave: false,
      captureLocationEvidence: false,
    }],
  }],
  unmatchedDeliveryIds: [],
  hasMoreAssignments: false,
  hasMoreDeliveries: false,
};
const savedRoute = {
  status: 'success' as const,
  loading: false,
  errorKind: undefined,
  serviceDate: '2026-07-24',
  model,
  freshness: 'fresh' as const,
  refresh,
  isRefreshing: false,
  lastRefreshedAt: new Date(2026, 6, 24, 6, 30).getTime(),
  findStop: jest.fn(),
};

function localAction(
  state: OfflineActionView['state'],
  localSequence = 1,
): OfflineActionView {
  return {
    actionId: `action-${localSequence}`,
    localSequence,
    vendorId: 'vendor-1',
    routeStopId: 'stop-1',
    serviceDate: '2026-07-24',
    routeSyncId: 'sync-1',
    occurredAt: '2026-07-24T06:30:00.000Z',
    request: {
      routeSyncId: 'sync-1',
      payloadVersion: 1,
      localSequence,
      serviceDate: '2026-07-24',
      occurredAt: '2026-07-24T06:30:00.000Z',
      outcome: 'delivered',
      items: [],
    },
    display: {
      routeId: 'route-1',
      routeName: 'North',
      routeStopId: 'stop-1',
      sequence: 1,
      householdName: 'Patel Home',
      householdAccountNumber: 'H-1',
      outcome: 'delivered',
      plannedItems: [],
    },
    state,
    blockedReason: null,
    attemptCount: 1,
    nextAttemptAtMs: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorCorrelationId: null,
    serverResponse: null,
    conflictId: state === 'conflict' ? 'conflict-1' : null,
    syncedAtMs: state === 'synced' ? 1 : null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access-token',
    actor: {
      userId: 'actor-1',
      sessionId: 'session-1',
      accessMode: 'standard',
      displayName: 'Agent A',
      platformRoles: [],
      memberships: [{
        id: 'agent-1',
        vendorId: 'vendor-1',
        vendorName: 'Vendor A',
        role: 'delivery_agent',
        status: 'active',
      }],
    },
    recoveryRouteSyncIds: [],
    requestCode: jest.fn(),
    requestRecoveryCode: jest.fn(),
    verifyCode: jest.fn(),
    retrySession,
    signOut: jest.fn(),
  });
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'ready',
    vendors: [{ vendorId: 'vendor-1', vendorName: 'Vendor A' }],
    activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor A' },
    selectVendor: jest.fn(),
    clearVendor,
  });
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true } as ReturnType<typeof useNetInfo>);
  jest.mocked(useTodayRoute).mockReturnValue(savedRoute);
  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle',
    actionsHydrated: true,
    groups: [],
    actions: [],
    getLogoutBlockingCount: jest.fn(),
    getAction: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(),
  });
});

test('renders the complete fresh route from device storage', async () => {
  await render(<RouteScreen />);

  expect(useTodayRoute).toHaveBeenCalledWith({
    actorId: 'actor-1',
    vendorId: 'vendor-1',
    accessToken: 'access-token',
    accessMode: 'standard',
  });
  expect(screen.getByText('Route saved on device.')).toBeTruthy();
  expect(screen.getByText('1. Patel Home · H-1')).toBeTruthy();
  expect(screen.getByText('Last refreshed: 06:30 AM')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Load more/i })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: /Stop 1, Patel Home/ }));
  expect(router.push).toHaveBeenCalledWith('/stops/stop-1');
});

test('renders the approved route identity hierarchy', async () => {
  await render(<RouteScreen />);

  expect(screen.getByRole('header', { name: "Today's route" })).toBeTruthy();
  expect(screen.getByText('Route ready')).toBeTruthy();
});

test.each([
  ['stale', 'Route expired. Refresh before recording deliveries.'],
  ['clock_rollback', 'Device time changed. Refresh the route before recording deliveries.'],
] as const)('warns for a %s saved route and offers refresh', async (freshness, message) => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...savedRoute, freshness });
  await render(<RouteScreen />);

  expect(screen.getByText(message)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh route' }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('labels a saved route when offline', async () => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: false } as ReturnType<typeof useNetInfo>);
  await render(<RouteScreen />);

  expect(screen.getByText('Offline. Showing saved route data.')).toBeTruthy();
  expect(screen.getByText('1. Patel Home · H-1')).toBeTruthy();
});

test('shows the missing offline state without exposing stale route content', async () => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: false } as ReturnType<typeof useNetInfo>);
  jest.mocked(useTodayRoute).mockReturnValue({
    ...savedRoute,
    status: 'error',
    model: undefined,
    serviceDate: undefined,
    freshness: 'missing',
    lastRefreshedAt: undefined,
  });
  await render(<RouteScreen />);

  expect(screen.getByText('No saved route')).toBeTruthy();
  expect(screen.getByText('Connect to the internet to download today’s route.')).toBeTruthy();
  expect(screen.queryByText('Patel Home')).toBeNull();
});

test('retains a saved route and reports refresh failure', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...savedRoute, errorKind: 'unavailable' });
  await render(<RouteScreen />);

  expect(screen.getByText('Could not refresh the route. Showing saved route data.')).toBeTruthy();
  expect(screen.getByText('1. Patel Home · H-1')).toBeTruthy();
});

test.each([
  ['pending', 'Saved on device. Waiting to synchronize.'],
  ['sending', 'Sending delivery outcome to MilkTrack.'],
  ['failed_retryable', 'Synchronization needs retry.'],
  ['conflict', 'Vendor review required.'],
  ['synced', 'Delivery outcome synchronized.'],
] as const)(
  'overlays the newest local %s action on route status and progress',
  async (state, message) => {
    jest.mocked(useAgentSync).mockReturnValue({
      status: 'idle',
      actionsHydrated: true,
      groups: [],
      actions: [
        localAction('pending', 1),
        localAction(state, 2),
      ],
      getLogoutBlockingCount: jest.fn(),
      getAction: jest.fn(),
      syncNow: jest.fn(),
      retryNow: jest.fn(),
    });

    await render(<RouteScreen />);

    expect(screen.getByText('Progress: 1 of 1 stops complete')).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
  },
);

test('hides saved route PII after protected access fails', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({
    ...savedRoute,
    errorKind: 'forbidden',
  });
  await render(<RouteScreen />);

  expect(screen.getByText('Route access restricted')).toBeTruthy();
  expect(screen.queryByText('Patel Home')).toBeNull();
  await waitFor(() => expect(clearVendor).toHaveBeenCalledTimes(1));
});

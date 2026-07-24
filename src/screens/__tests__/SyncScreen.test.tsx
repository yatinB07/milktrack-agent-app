import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import type { OfflineActionView } from '@/offline/AgentSyncProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { SyncScreen } from '../SyncScreen';

jest.mock('@/offline/AgentSyncProvider', () => ({ useAgentSync: jest.fn() }));
jest.mock('@/agent/AgentWorkspaceProvider');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'authenticated', retrySession: jest.fn() }),
}));
jest.mock('@/components/ConnectivityBanner', () => {
  const { Text } = jest.requireActual('react-native');
  return { ConnectivityBanner: () => <Text>Connection status: Offline</Text> };
});

const syncNow = jest.fn();
const action = (
  actionId: string,
  state: OfflineActionView['state'],
): OfflineActionView => ({
  actionId,
  localSequence: Number(actionId.at(-1)),
  vendorId: 'vendor-b',
  routeStopId: `stop-${actionId}`,
  serviceDate: '2026-07-24',
  routeSyncId: 'lease-safe',
  occurredAt: '2026-07-24T05:30:00.000Z',
  request: {} as OfflineActionView['request'],
  display: {
    routeId: 'route-safe',
    routeName: 'Morning route',
    routeStopId: `stop-${actionId}`,
    sequence: Number(actionId.at(-1)),
    householdName: `Home ${actionId}`,
    householdAccountNumber: `H-${actionId}`,
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
  conflictId: state === 'conflict' ? 'conflict-safe' : null,
  syncedAtMs: state === 'synced' ? 1_784_765_460_000 : null,
});
const pendingAction = {
  ...action('action-1', 'pending'),
  idempotencyKey: 'sensitive-idempotency-key',
  actorId: 'sensitive-actor-id',
  deviceId: 'sensitive-device-id',
} as OfflineActionView;
const baseSyncView = {
  status: 'idle' as const,
  actionsHydrated: true,
  groups: [
    {
      vendorId: 'vendor-b', pending: 1, sending: 1, synced: 2,
      failedRetryable: 3, conflict: 4, oldestPendingAtMs: 1_784_764_800_000,
      routeFreshness: 'fresh' as const, lastRouteSyncAtMs: 1_784_765_400_000,
      lastActionSyncAtMs: 1_784_765_460_000,
    },
    {
      vendorId: 'vendor-a', pending: 0, sending: 0, synced: 0,
      failedRetryable: 0, conflict: 0, oldestPendingAtMs: null,
      routeFreshness: 'stale' as const, lastRouteSyncAtMs: null,
      lastActionSyncAtMs: null,
    },
    {
      vendorId: 'vendor-c', pending: 0, sending: 0, synced: 1,
      failedRetryable: 0, conflict: 0, oldestPendingAtMs: null,
      routeFreshness: 'unavailable' as const, lastRouteSyncAtMs: null,
      lastActionSyncAtMs: null,
    },
  ],
  actions: [
    pendingAction,
    action('action-2', 'failed_retryable'),
    action('action-3', 'synced'),
    action('action-4', 'conflict'),
  ],
  getLogoutBlockingCount: jest.fn(),
  getAction: jest.fn(),
  syncNow,
  retryNow: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'ready',
    vendors: [{ vendorId: 'vendor-b', vendorName: 'Blue Dairy' }],
    activeVendor: { vendorId: 'vendor-b', vendorName: 'Blue Dairy' },
    selectVendor: jest.fn(),
    clearVendor: jest.fn(),
  });
  jest.mocked(useAgentSync).mockReturnValue(baseSyncView);
});

it('groups queue truth by vendor separately from connection status and syncs on request', async () => {
  await render(<SyncScreen />);

  expect(screen.getByRole('header', { name: 'Synchronization' })).toBeTruthy();
  expect(screen.getByText('Connection status: Offline')).toBeTruthy();
  expect(screen.getByText('Sync status: Ready to sync')).toBeTruthy();
  expect(screen.getByText('Blue Dairy')).toBeTruthy();
  expect(screen.getAllByText('Vendor workspace unavailable')).toHaveLength(2);
  expect(screen.getByText('Queue: 1 Saved on device · 1 Sending · 2 Sent to MilkTrack · 3 Needs retry · 4 Vendor review required')).toBeTruthy();
  expect(screen.getByText('Route freshness: Fresh')).toBeTruthy();
  expect(screen.getByText('Route freshness: Stale')).toBeTruthy();
  expect(screen.getByText('Route freshness: Unavailable')).toBeTruthy();
  expect(screen.getAllByText(/Last reported route:/)).toHaveLength(3);
  expect(screen.getAllByText('Last reported route: Unavailable')).toHaveLength(2);
  expect(screen.getAllByText('Last reported action: Unavailable')).toHaveLength(2);
  expect(screen.getByLabelText('Synchronization queue changed')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Sync now' }));
  expect(syncNow).toHaveBeenCalledTimes(1);
});

it('links safe action rows to the matching detail routes with accessible hints', async () => {
  await render(<SyncScreen />);

  const rows = [
    ['Saved on device. Home action-1. Morning route. Stop 1.', '/sync-actions/action-1'],
    ['Needs retry. Home action-2. Morning route. Stop 2.', '/sync-actions/action-2'],
    ['Sent to MilkTrack. Home action-3. Morning route. Stop 3.', '/sync-actions/action-3'],
    ['Vendor review required. Home action-4. Morning route. Stop 4.', '/sync-conflicts/action-4'],
  ] as const;
  for (const [label, path] of rows) {
    const row = screen.getByRole('button', { name: label });
    expect(row).toHaveProp('accessibilityHint', 'Opens synchronization details');
    await fireEvent.press(row);
    expect(router.push).toHaveBeenLastCalledWith(path);
  }
  expect(screen.queryByText('sensitive-idempotency-key')).toBeNull();
  expect(screen.queryByText('sensitive-actor-id')).toBeNull();
  expect(screen.queryByText('sensitive-device-id')).toBeNull();
});

it.each([
  ['syncing', 'Sync status: Synchronizing'],
  ['paused_authentication', 'Sync status: Paused — sign in required'],
  ['paused_authorization', 'Sync status: Paused — access required'],
] as const)('announces provider status %s without rewriting queue facts', async (status, label) => {
  jest.mocked(useAgentSync).mockReturnValue({
    ...baseSyncView,
    status,
  });

  await render(<SyncScreen />);
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByText('Queue: 1 Saved on device · 1 Sending · 2 Sent to MilkTrack · 3 Needs retry · 4 Vendor review required')).toBeTruthy();
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { SyncScreen } from '../SyncScreen';

jest.mock('@/offline/AgentSyncProvider');
jest.mock('@/agent/AgentWorkspaceProvider');
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'authenticated', retrySession: jest.fn() }),
}));
jest.mock('@/components/ConnectivityBanner', () => {
  const { Text } = jest.requireActual('react-native');
  return { ConnectivityBanner: () => <Text>Connection status: Offline</Text> };
});

const syncNow = jest.fn();
const baseSyncView = {
  status: 'idle' as const,
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
      routeFreshness: 'missing' as const, lastRouteSyncAtMs: null,
      lastActionSyncAtMs: null,
    },
  ],
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

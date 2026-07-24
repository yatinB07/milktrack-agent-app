import { render, screen } from '@testing-library/react-native';

import type { OfflineActionView } from '@/offline/AgentSyncProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { ConflictScreen } from '../ConflictScreen';

jest.mock('@/offline/AgentSyncProvider', () => ({ useAgentSync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

const conflict = {
  actionId: 'action-conflict', vendorId: 'vendor-a', routeStopId: 'stop-9', serviceDate: '2026-07-24',
  routeSyncId: 'lease-7', localSequence: 12, occurredAt: '2026-07-24T05:30:00.000Z',
  state: 'conflict', attemptCount: 1, nextAttemptAtMs: null, lastErrorCode: null,
  lastErrorMessage: null, conflictId: 'conflict-4',
  serverResponse: { conflictId: 'conflict-4', conflictStatus: 'pending' },
  display: {
    routeId: 'route-3', routeName: 'Morning route', routeStopId: 'stop-9', sequence: 4,
    householdName: 'Patel Home', householdAccountNumber: 'H-100', outcome: 'delivered',
    plannedItems: [{ productName: 'Milk', unitName: 'Litre', plannedQuantity: '2' }],
  },
} as unknown as OfflineActionView;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle', actionsHydrated: true, groups: [], actions: [conflict], getLogoutBlockingCount: jest.fn(), getAction: jest.fn(() => conflict), syncNow: jest.fn(), retryNow: jest.fn(),
  });
});

it('shows immutable local and safe server facts with billing-safe vendor review copy', async () => {
  await render(<ConflictScreen actionId="action-conflict" />);

  expect(screen.getByRole('header', { name: 'Vendor review required' })).toBeTruthy();
  expect(screen.getByText('Vendor review required. The vendor will decide whether a correction is appropriate.')).toBeTruthy();
  expect(screen.getByText('Outcome: Delivered')).toBeTruthy();
  expect(screen.getByText('Household: Patel Home · H-100')).toBeTruthy();
  expect(screen.getByText('Conflict reference: conflict-4')).toBeTruthy();
  expect(screen.getByText('Server result: {"conflictId":"conflict-4","conflictStatus":"pending"}')).toBeTruthy();
  expect(screen.queryByText(/Billed|Accepted|Keep server|Correct outcome|Resolve|Delete|Export/)).toBeNull();
});

it('hides unavailable conflict data without exposing local household facts', async () => {
  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle', actionsHydrated: true, groups: [], actions: [], getLogoutBlockingCount: jest.fn(), getAction: jest.fn(() => undefined), syncNow: jest.fn(), retryNow: jest.fn(),
  });
  await render(<ConflictScreen actionId="outside-scope" />);

  expect(screen.getAllByText('Sync item unavailable')).toHaveLength(2);
  expect(screen.queryByText('Patel Home')).toBeNull();
  expect(screen.queryByText('H-100')).toBeNull();
});

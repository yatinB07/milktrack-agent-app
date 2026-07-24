import { fireEvent, render, screen } from '@testing-library/react-native';

import type { OfflineActionView } from '@/offline/AgentSyncProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { QueuedActionScreen } from '../QueuedActionScreen';

jest.mock('@/offline/AgentSyncProvider', () => ({ useAgentSync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

const retryNow = jest.fn();
const action = (state: OfflineActionView['state'] = 'failed_retryable') => ({
  actionId: 'action-1', vendorId: 'vendor-a', routeStopId: 'stop-9', serviceDate: '2026-07-24',
  routeSyncId: 'lease-7', localSequence: 12, occurredAt: '2026-07-24T05:30:00.000Z',
  state, attemptCount: 2, nextAttemptAtMs: 1_784_766_000_000,
  lastErrorCode: 'OFFLINE_ACTION_PROCESSING', lastErrorMessage: 'Try again later',
  serverResponse: null, conflictId: null,
  display: {
    routeId: 'route-3', routeName: 'Morning route', routeStopId: 'stop-9', sequence: 4,
    householdName: 'Patel Home', householdAccountNumber: 'H-100', outcome: 'delivered',
    plannedItems: [{ productName: 'Milk', unitName: 'Litre', plannedQuantity: '2' }],
  },
} as unknown as OfflineActionView);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle', actionsHydrated: true, groups: [], actions: [action()], getAction: jest.fn(() => action()), syncNow: jest.fn(), retryNow,
  });
});

it('shows immutable local facts and retries only a retryable action', async () => {
  await render(<QueuedActionScreen actionId="action-1" />);

  expect(screen.getByRole('header', { name: 'Synchronization details' })).toBeTruthy();
  expect(screen.getByText('Needs retry')).toBeTruthy();
  expect(screen.getByText('Outcome: Delivered')).toBeTruthy();
  expect(screen.getByText('Service date: 2026-07-24')).toBeTruthy();
  expect(screen.getByText('Route: Morning route (route-3) · Stop stop-9')).toBeTruthy();
  expect(screen.getByText('Household: Patel Home · H-100')).toBeTruthy();
  expect(screen.getByText('Planned: 2 Litre · Milk')).toBeTruthy();
  expect(screen.getByText('Local sequence: 12')).toBeTruthy();
  expect(screen.getByText('Occurred: 2026-07-24T05:30:00.000Z')).toBeTruthy();
  expect(screen.getByText('Route lease: lease-7')).toBeTruthy();
  expect(screen.getByText('Attempts: 2')).toBeTruthy();
  expect(screen.getByText('Safe error: OFFLINE_ACTION_PROCESSING · Try again later')).toBeTruthy();
  expect(screen.queryByText(/Delete|Discard|Edit|Reset key|Export/)).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Retry now' }));
  expect(retryNow).toHaveBeenCalledWith('action-1');
});

it('disables retry while it is running and hides it for non-retryable queue states', async () => {
  let resolveRetry: (() => void) | undefined;
  retryNow.mockImplementation(() => new Promise<void>((resolve) => { resolveRetry = resolve; }));
  const view = await render(<QueuedActionScreen actionId="action-1" />);

  const retry = screen.getByRole('button', { name: 'Retry now' });
  await fireEvent.press(retry);
  expect(retry).toHaveProp('accessibilityState', { disabled: true });
  resolveRetry?.();
  await view.unmount();

  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle', actionsHydrated: true, groups: [], actions: [action('pending')], getAction: jest.fn(() => action('pending')), syncNow: jest.fn(), retryNow,
  });
  await render(<QueuedActionScreen actionId="action-1" />);
  expect(screen.getByText('Saved on device')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull();
});

it('hides out-of-scope action facts behind a neutral unavailable state', async () => {
  jest.mocked(useAgentSync).mockReturnValue({
    status: 'idle', actionsHydrated: true, groups: [], actions: [], getAction: jest.fn(() => undefined), syncNow: jest.fn(), retryNow,
  });
  await render(<QueuedActionScreen actionId="outside-scope" />);

  expect(screen.getAllByText('Sync item unavailable')).toHaveLength(2);
  expect(screen.queryByText('Patel Home')).toBeNull();
  expect(screen.queryByText('H-100')).toBeNull();
});

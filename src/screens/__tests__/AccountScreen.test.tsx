import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountScreen } from '../AccountScreen';

const mockPush = jest.fn();
const mockSignOut = jest.fn();
let mockActions: { state: string }[] = [];
let mockActionsHydrated = true;

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    actor: { displayName: 'Agent A' },
    signOut: mockSignOut,
  }),
}));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({
  useAgentWorkspace: () => ({
    status: 'ready',
    vendors: [{ vendorId: 'vendor', vendorName: 'Vendor A' }],
    activeVendor: { vendorId: 'vendor', vendorName: 'Vendor A' },
  }),
}));
jest.mock('@/offline/AgentSyncProvider', () => ({
  useAgentSync: () => ({
    actionsHydrated: mockActionsHydrated,
    actions: mockActions,
  }),
}));

beforeEach(() => {
  mockActions = [];
  mockActionsHydrated = true;
  mockPush.mockClear();
  mockSignOut.mockClear();
});

it('fails closed while scoped actions are hydrating', async () => {
  mockActionsHydrated = false;
  await render(<AccountScreen />);

  expect(screen.getByText('Sign out unavailable')).toBeTruthy();
  expect(screen.getByText('Checking saved actions on this device before signing out.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'View synchronization' })).toBeNull();
});

it('blocks sign out until pending actions are synchronized', async () => {
  mockActions = [
    { state: 'pending' },
    { state: 'sending' },
    { state: 'failed_retryable' },
    { state: 'synced' },
    { state: 'conflict' },
  ];
  await render(<AccountScreen />);

  expect(screen.getByText('Sign out unavailable')).toBeTruthy();
  expect(screen.getByText('3 unsynchronized actions must be synchronized before signing out.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'View synchronization' }));

  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/sync');
});

it('keeps the existing sign out action for synchronized and conflicted actions', async () => {
  mockActions = [{ state: 'synced' }, { state: 'conflict' }];
  await render(<AccountScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

  expect(screen.queryByText('Sign out unavailable')).toBeNull();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AgentSyncProvider, useAgentSync } from '@/offline/AgentSyncProvider';
import {
  initializeOfflineDatabase,
  OFFLINE_DATABASE_NAME,
} from '@/offline/database';
import { AppProviders } from '../AppProviders';

const mockSQLiteProvider = jest.fn(
  ({ children }: Readonly<{ children: React.ReactNode }>) => children,
);
const mockWorkspaceProvider = jest.fn(
  ({ children }: Readonly<{ children: React.ReactNode }>) => children,
);

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(),
  QueryClientProvider: ({
    children,
  }: Readonly<{ children: React.ReactNode }>) => children,
}));
jest.mock('expo-sqlite', () => ({
  SQLiteProvider: (props: Readonly<{ children: React.ReactNode }>) =>
    mockSQLiteProvider(props),
}), { virtual: true });
jest.mock('@/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: Readonly<{ children: React.ReactNode }>) =>
    children,
  useAuth: jest.fn(),
}));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({
  AgentWorkspaceProvider: (props: Readonly<{ children: React.ReactNode }>) =>
    mockWorkspaceProvider(props),
}));
jest.mock('@/offline/AgentSyncProvider', () => ({
  AgentSyncProvider: jest.fn(
    ({ children }: Readonly<{ children: React.ReactNode }>) => children,
  ),
  useAgentSync: jest.fn(),
}));

const auth = useAuth as jest.Mock;
const syncProvider = AgentSyncProvider as jest.Mock;
const syncView = useAgentSync as jest.Mock;
const standardScope = {
  actorId: 'actor-1',
  deviceId: 'device-1',
  accessMode: 'standard' as const,
};
const actor = {
  userId: 'actor-1',
  displayName: 'Agent',
  sessionId: 'session-1',
  accessMode: 'standard' as const,
  platformRoles: [],
  memberships: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  syncView.mockReturnValue({
    status: 'idle',
    groups: [],
    actions: [],
    getAction: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(),
  });
});

test('mounts SQLite and synchronization only for the matching authenticated standard scope', async () => {
  auth.mockReturnValue({
    status: 'authenticated',
    actor,
    accessToken: 'access-1',
    deviceId: 'device-1',
    offlineScope: standardScope,
  });

  const view = await render(
    <AppProviders>
      <Text>normal application</Text>
    </AppProviders>,
  );

  expect(view.getByText('normal application')).toBeTruthy();
  expect(mockSQLiteProvider).toHaveBeenCalledWith(
    expect.objectContaining({
      databaseName: OFFLINE_DATABASE_NAME,
      onInit: initializeOfflineDatabase,
    }),
  );
  expect(syncProvider).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: standardScope,
      accessToken: 'access-1',
    }),
    undefined,
  );
  expect(mockWorkspaceProvider).toHaveBeenCalled();
});

test.each([
  ['loading', undefined, undefined],
  ['anonymous', undefined, undefined],
  ['permission-denied', actor, standardScope],
  ['different actor', { ...actor, userId: 'actor-2' }, standardScope],
  [
    'untrusted recovery',
    { ...actor, accessMode: 'offline_recovery' },
    {
      ...standardScope,
      accessMode: 'offline_recovery',
      recoveryRouteSyncId: undefined,
    },
  ],
] as const)(
  'does not mount local synchronization for %s',
  async (status, currentActor, offlineScope) => {
    auth.mockReturnValue({
      status,
      actor: currentActor,
      accessToken: status === 'loading' ? undefined : 'access-1',
      deviceId: 'device-1',
      offlineScope,
    });

    await render(
      <AppProviders>
        <Text>normal application</Text>
      </AppProviders>,
    );

    expect(syncProvider).not.toHaveBeenCalled();
  },
);

test('recovery mode renders only lease-bound synchronization progress', async () => {
  const recoveryScope = {
    ...standardScope,
    accessMode: 'offline_recovery' as const,
    recoveryRouteSyncId: 'route-sync-1',
  };
  auth.mockReturnValue({
    status: 'authenticated',
    actor: {
      ...actor,
      accessMode: 'offline_recovery',
      recoveryRouteSyncId: 'route-sync-1',
    },
    accessToken: 'recovery-access',
    deviceId: 'device-1',
    offlineScope: recoveryScope,
  });
  syncView.mockReturnValue({
    status: 'syncing',
    groups: [
      {
        vendorId: 'vendor-1',
        pending: 2,
        sending: 1,
        synced: 0,
        failedRetryable: 0,
        conflict: 0,
      },
    ],
    actions: [],
    getAction: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(),
  });

  const view = await render(
    <AppProviders>
      <Text>normal application</Text>
    </AppProviders>,
  );

  expect(syncProvider).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: recoveryScope,
      accessToken: 'recovery-access',
    }),
    undefined,
  );
  await waitFor(() =>
    expect(view.getByText('Recovering saved deliveries')).toBeTruthy(),
  );
  expect(view.queryByText('normal application')).toBeNull();
  expect(mockWorkspaceProvider).not.toHaveBeenCalled();
});

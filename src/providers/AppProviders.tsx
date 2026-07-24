import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider } from 'expo-sqlite';
import { useState, type PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { AgentWorkspaceProvider } from '@/agent/AgentWorkspaceProvider';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { AgentSyncProvider, useAgentSync } from '@/offline/AgentSyncProvider';
import {
  initializeOfflineDatabase,
  OFFLINE_DATABASE_NAME,
} from '@/offline/database';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
  return <QueryClientProvider client={queryClient}><SQLiteProvider databaseName={OFFLINE_DATABASE_NAME} onInit={initializeOfflineDatabase}><AuthProvider><AuthenticatedOfflineBoundary>{children}</AuthenticatedOfflineBoundary></AuthProvider></SQLiteProvider></QueryClientProvider>;
}

function AuthenticatedOfflineBoundary({ children }: PropsWithChildren) {
  const auth = useAuth();
  const scope = auth.offlineScope;
  const trusted =
    auth.status === 'authenticated' &&
    auth.actor !== undefined &&
    auth.accessToken !== undefined &&
    auth.deviceId !== undefined &&
    scope !== undefined &&
    scope.actorId === auth.actor.userId &&
    scope.deviceId === auth.deviceId &&
    scope.accessMode === auth.actor.accessMode &&
    (scope.accessMode === 'standard' ||
      (auth.actor.recoveryRouteSyncId === scope.recoveryRouteSyncId &&
        scope.recoveryRouteSyncId.length > 0));

  if (!trusted) {
    return <AgentWorkspaceProvider>{children}</AgentWorkspaceProvider>;
  }

  return (
    <AgentSyncProvider scope={scope} accessToken={auth.accessToken}>
      {scope.accessMode === 'offline_recovery' ? (
        <RecoverySyncProgress />
      ) : (
        <AgentWorkspaceProvider>{children}</AgentWorkspaceProvider>
      )}
    </AgentSyncProvider>
  );
}

function RecoverySyncProgress() {
  const sync = useAgentSync();
  const remaining = sync.groups.reduce(
    (total, group) =>
      total + group.pending + group.sending + group.failedRetryable,
    0,
  );
  return (
    <View accessibilityRole="summary">
      <Text accessibilityRole="header">Recovering saved deliveries</Text>
      <Text>{sync.status === 'syncing' ? 'Synchronizing' : 'Waiting to synchronize'}</Text>
      <Text>{remaining} saved actions remaining</Text>
    </View>
  );
}

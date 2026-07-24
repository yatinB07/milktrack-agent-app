import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import type { OfflineAction } from './action-store';
import {
  createSyncRunner,
  type SyncGroupSnapshot,
  type SyncStatus,
} from './sync-runner';
import type { OfflineAccessScope } from './types';

export type SyncVendorGroup = SyncGroupSnapshot;
export type OfflineActionView = Omit<
  OfflineAction,
  'actorId' | 'deviceId' | 'idempotencyKey'
>;

export type AgentSyncView = Readonly<{
  status: SyncStatus;
  groups: readonly SyncVendorGroup[];
  getAction(actionId: string): OfflineActionView | undefined;
  syncNow(): Promise<void>;
  retryNow(actionId: string): Promise<void>;
}>;

const AgentSyncContext = createContext<AgentSyncView | null>(null);

export function useAgentSync() {
  const value = useContext(AgentSyncContext);
  if (!value) {
    throw new Error('Agent synchronization provider is unavailable');
  }
  return value;
}

export function AgentSyncProvider({
  scope,
  accessToken,
  children,
}: PropsWithChildren<{
  scope: OfflineAccessScope;
  accessToken: string;
}>) {
  const db = useSQLiteContext();
  const previousToken = useRef(accessToken);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [groups, setGroups] = useState<readonly SyncVendorGroup[]>([]);
  const [actions, setActions] = useState<readonly OfflineActionView[]>([]);
  const recoveryRouteSyncId =
    scope.accessMode === 'offline_recovery'
      ? scope.recoveryRouteSyncId
      : undefined;
  const runner = useMemo(
    () =>
      createSyncRunner({
        db,
        scope:
          recoveryRouteSyncId !== undefined
            ? {
                actorId: scope.actorId,
                deviceId: scope.deviceId,
                accessMode: 'offline_recovery',
                recoveryRouteSyncId,
              }
            : {
                actorId: scope.actorId,
                deviceId: scope.deviceId,
                accessMode: 'standard',
              },
        onStatusChange: setStatus,
      }),
    [
      db,
      recoveryRouteSyncId,
      scope.actorId,
      scope.deviceId,
      setStatus,
    ],
  );

  const refresh = async () => {
    const snapshot = await runner.getSnapshot();
    setGroups(snapshot.groups);
    setActions(snapshot.actions.map(toActionView));
    setStatus(runner.status);
  };
  const syncNow = async () => {
    await runner.wake();
    await refresh();
  };
  const retryNow = async (actionId: string) => {
    await runner.retryNow(actionId);
    await refresh();
  };

  useEffect(() => {
    runner.setAccessToken(accessToken);
    if (previousToken.current === accessToken) return;
    previousToken.current = accessToken;
    void runner
      .resumeAuthentication()
      .then(() => runner.wake())
      .then(() => runner.getSnapshot())
      .then((snapshot) => {
        setGroups(snapshot.groups);
        setActions(snapshot.actions.map(toActionView));
        setStatus(runner.status);
      })
      .catch(() => setStatus('idle'));
  }, [accessToken, runner]);

  useEffect(() => {
    const updateView = () =>
      runner.getSnapshot().then((snapshot) => {
        setGroups(snapshot.groups);
        setActions(snapshot.actions.map(toActionView));
        setStatus(runner.status);
      });
    const wake = () => {
      void runner.wake().then(updateView).catch(() => setStatus('idle'));
    };
    wake();
    let wasConnected: boolean | null = null;
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') wake();
      },
    );
    const removeNetInfoListener = addNetInfoListener(({ isConnected }) => {
      const reconnected = wasConnected === false && isConnected === true;
      wasConnected = isConnected;
      if (reconnected) wake();
    });
    return () => {
      appStateSubscription.remove();
      removeNetInfoListener();
    };
  }, [runner]);

  const value: AgentSyncView = {
    status,
    groups,
    getAction: (actionId) =>
      actions.find((action) => action.actionId === actionId),
    syncNow,
    retryNow,
  };

  return (
    <AgentSyncContext.Provider value={value}>
      {children}
    </AgentSyncContext.Provider>
  );
}

function toActionView(action: OfflineAction): OfflineActionView {
  const {
    actorId: _actorId,
    deviceId: _deviceId,
    idempotencyKey: _idempotencyKey,
    ...view
  } = action;
  return view;
}

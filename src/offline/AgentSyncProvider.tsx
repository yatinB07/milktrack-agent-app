import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import {
  countLogoutBlocking,
  type OfflineAction,
} from './action-store';
import {
  createSyncRunner,
  type SyncGroupSnapshot,
  type SyncStatus,
} from './sync-runner';
import type { OfflineAccessScope } from './types';

export type SyncVendorGroup = SyncGroupSnapshot;
export type OfflineActionView = Pick<
  OfflineAction,
  | 'actionId'
  | 'localSequence'
  | 'vendorId'
  | 'routeStopId'
  | 'serviceDate'
  | 'routeSyncId'
  | 'occurredAt'
  | 'request'
  | 'display'
  | 'state'
  | 'blockedReason'
  | 'attemptCount'
  | 'nextAttemptAtMs'
  | 'lastHttpStatus'
  | 'lastErrorCode'
  | 'lastErrorMessage'
  | 'lastErrorCorrelationId'
  | 'serverResponse'
  | 'conflictId'
  | 'syncedAtMs'
>;

export type AgentSyncView = Readonly<{
  status: SyncStatus;
  actionsHydrated: boolean;
  groups: readonly SyncVendorGroup[];
  actions: readonly OfflineActionView[];
  getAction(actionId: string): OfflineActionView | undefined;
  getLogoutBlockingCount(): Promise<number>;
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

type AgentSyncProviderProps = PropsWithChildren<{
  scope: OfflineAccessScope;
  accessToken: string;
}>;

export function AgentSyncProvider(props: AgentSyncProviderProps) {
  const recoveryRouteSyncId =
    props.scope.accessMode === 'offline_recovery'
      ? props.scope.recoveryRouteSyncId
      : null;
  const scopeKey = JSON.stringify([
    props.scope.actorId,
    props.scope.deviceId,
    props.scope.accessMode,
    recoveryRouteSyncId,
  ]);
  return <ScopedAgentSyncProvider key={scopeKey} {...props} />;
}

function ScopedAgentSyncProvider({
  scope,
  accessToken,
  children,
}: AgentSyncProviderProps) {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [actionsHydrated, setActionsHydrated] = useState(false);
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
    setActionsHydrated(true);
    setStatus(runner.status);
  };
  const syncNow = async () => {
    await refresh();
    await runner.wake();
    await refresh();
  };
  const retryNow = async (actionId: string) => {
    await runner.retryNow(actionId);
    await refresh();
  };

  useEffect(() => {
    let active = true;
    runner.setAccessToken(accessToken);
    void runner
      .resumeAuthentication()
      .then(() => runner.getSnapshot())
      .then((snapshot) => {
        if (!active) return;
        setGroups(snapshot.groups);
        setActions(snapshot.actions.map(toActionView));
        setActionsHydrated(true);
        setStatus(runner.status);
      })
      .catch(() => {
        if (active) setStatus('idle');
      });
    return () => {
      active = false;
    };
  }, [accessToken, runner]);

  useEffect(() => {
    let active = true;
    const updateView = () =>
      runner.getSnapshot().then((snapshot) => {
        if (!active) return;
        setGroups(snapshot.groups);
        setActions(snapshot.actions.map(toActionView));
        setActionsHydrated(true);
        setStatus(runner.status);
      });
    const wake = () => {
      void runner
        .wake()
        .then(updateView)
        .catch(() => {
          if (active) setStatus('idle');
        });
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
      active = false;
      appStateSubscription.remove();
      removeNetInfoListener();
    };
  }, [runner]);

  const value: AgentSyncView = {
    status,
    actionsHydrated,
    groups,
    actions,
    getAction: (actionId) =>
      actions.find((action) => action.actionId === actionId),
    getLogoutBlockingCount: () => countLogoutBlocking(db, scope),
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
  return {
    actionId: action.actionId,
    localSequence: action.localSequence,
    vendorId: action.vendorId,
    routeStopId: action.routeStopId,
    serviceDate: action.serviceDate,
    routeSyncId: action.routeSyncId,
    occurredAt: action.occurredAt,
    request: action.request,
    display: action.display,
    state: action.state,
    blockedReason: action.blockedReason,
    attemptCount: action.attemptCount,
    nextAttemptAtMs: action.nextAttemptAtMs,
    lastHttpStatus: action.lastHttpStatus,
    lastErrorCode: action.lastErrorCode,
    lastErrorMessage: action.lastErrorMessage,
    lastErrorCorrelationId: action.lastErrorCorrelationId,
    serverResponse: action.serverResponse,
    conflictId: action.conflictId,
    syncedAtMs: action.syncedAtMs,
  };
}

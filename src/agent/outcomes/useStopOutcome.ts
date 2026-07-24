import { useMutation } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';

import {
  useAgentSync,
  type OfflineActionView,
} from '@/offline/AgentSyncProvider';
import {
  enqueueAction,
  type OfflineAction,
} from '@/offline/action-store';
import type { VendorRouteScope } from '@/offline/types';
import type { StopOutcomeRequest } from './types';

type StopOutcomeAction = Readonly<
  Pick<OfflineActionView, 'actionId' | 'localSequence' | 'state'>
>;

export function useStopOutcome(input: Readonly<{
  scope: VendorRouteScope;
  routeStopId: string;
}>) {
  const db = useSQLiteContext();
  const sync = useAgentSync();
  const mutation = useMutation({
    mutationKey: [
      'agent',
      input.scope.vendorId,
      'offline-stop-outcome',
      input.routeStopId,
    ],
    mutationFn: (submission: Readonly<{
      actionId: string;
      idempotencyKey: string;
      request: StopOutcomeRequest;
    }>) => enqueueAction(db, {
      scope: input.scope,
      actionId: submission.actionId,
      idempotencyKey: submission.idempotencyKey,
      routeStopId: input.routeStopId,
      request: submission.request,
    }),
    retry: false,
    onSuccess: () => {
      void sync.syncNow().catch(() => {});
    },
  });
  const providerAction = newestAction(
    sync.actions,
    input.scope.vendorId,
    input.routeStopId,
  );
  const localAction = mutation.data ? toActionView(mutation.data) : undefined;

  return {
    submit: (request: StopOutcomeRequest) => {
      const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      return mutation.mutateAsync({
        actionId: `action-${nonce}`,
        idempotencyKey: `outcome-${nonce}`,
        request,
      });
    },
    pending: mutation.isPending,
    action: localAction && (
      !providerAction || localAction.localSequence > providerAction.localSequence
    ) ? localAction : providerAction,
    error: mutation.error instanceof Error ? mutation.error : undefined,
    reset: mutation.reset,
  };
}

function newestAction(
  actions: readonly OfflineActionView[],
  vendorId: string,
  routeStopId: string,
): StopOutcomeAction | undefined {
  let newest: StopOutcomeAction | undefined;
  for (const action of actions) {
    if (
      action.vendorId === vendorId
      && action.routeStopId === routeStopId
      && (!newest || action.localSequence > newest.localSequence)
    ) {
      newest = toActionView(action);
    }
  }
  return newest;
}

function toActionView(
  action: Pick<OfflineAction, 'actionId' | 'localSequence' | 'state'>,
): StopOutcomeAction {
  return {
    actionId: action.actionId,
    localSequence: action.localSequence,
    state: action.state,
  };
}

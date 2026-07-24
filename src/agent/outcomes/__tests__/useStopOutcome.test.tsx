import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import {
  useAgentSync,
  type AgentSyncView,
  type OfflineActionView,
} from '@/offline/AgentSyncProvider';
import {
  enqueueAction,
  type OfflineAction,
} from '@/offline/action-store';
import type { StopOutcomeRequest } from '../types';
import { useStopOutcome } from '../useStopOutcome';

jest.mock('expo-sqlite', () => ({ useSQLiteContext: jest.fn() }));
jest.mock('@/offline/action-store', () => ({ enqueueAction: jest.fn() }));
jest.mock('@/offline/AgentSyncProvider', () => ({ useAgentSync: jest.fn() }));

const db = {};
const scope = {
  actorId: 'actor-a',
  deviceId: 'device-a',
  vendorId: 'vendor-a',
};
const input = { scope, routeStopId: 'stop-a' };
const body: StopOutcomeRequest = {
  serviceDate: '2026-07-23',
  occurredAt: '2026-07-23T01:05:00.000Z',
  outcome: 'missed',
  reasonCode: 'address_not_found',
  items: [{
    scheduledDeliveryId: '11111111-1111-4111-8111-111111111111',
    expectedVersion: 2,
  }],
};
const syncNow = jest.fn();

function action(
  actionId: string,
  localSequence: number,
  state: OfflineActionView['state'] = 'pending',
  vendorId = 'vendor-a',
  routeStopId = 'stop-a',
): OfflineActionView {
  return {
    actionId,
    localSequence,
    vendorId,
    routeStopId,
    serviceDate: body.serviceDate,
    routeSyncId: 'route-sync-a',
    occurredAt: body.occurredAt,
    request: body as OfflineActionView['request'],
    display: {
      routeId: 'route-a',
      routeName: 'Route A',
      routeStopId,
      sequence: 1,
      householdName: 'Household A',
      householdAccountNumber: 'H-A',
      outcome: body.outcome,
      plannedItems: [],
    },
    state,
    blockedReason: null,
    attemptCount: 0,
    nextAttemptAtMs: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorCorrelationId: null,
    serverResponse: null,
    conflictId: null,
    syncedAtMs: null,
  };
}

function syncView(actions: readonly OfflineActionView[] = []): AgentSyncView {
  return {
    status: 'idle',
    actionsHydrated: true,
    groups: [],
    actions,
    getAction: jest.fn(),
    syncNow,
    retryNow: jest.fn(),
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 3, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStopOutcome(input), { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSQLiteContext).mockReturnValue(db as never);
  jest.mocked(useAgentSync).mockReturnValue(syncView());
});

it('durably enqueues one immutable submission before waking the shared runner', async () => {
  const order: string[] = [];
  let releaseWake!: () => void;
  syncNow.mockImplementation(async () => {
    order.push('wake');
    await new Promise<void>((resolve) => { releaseWake = resolve; });
  });
  jest.mocked(enqueueAction).mockImplementation(async (_db, submitted) => {
    order.push('enqueue');
    return {
      ...action(submitted.actionId, 1),
      idempotencyKey: submitted.idempotencyKey,
      actorId: scope.actorId,
      deviceId: scope.deviceId,
      request: submitted.request,
    } as OfflineAction;
  });
  const { result } = await setup();

  await act(() => result.current.submit(body));

  expect(enqueueAction).toHaveBeenCalledTimes(1);
  const submitted = jest.mocked(enqueueAction).mock.calls[0]?.[1];
  expect(submitted).toMatchObject({ scope, routeStopId: 'stop-a', request: body });
  expect(submitted?.actionId).toEqual(expect.any(String));
  expect(submitted?.idempotencyKey).toEqual(expect.any(String));
  expect(submitted?.actionId).not.toBe(submitted?.idempotencyKey);
  expect(order).toEqual(['enqueue', 'wake']);
  await waitFor(() => expect(result.current.action).toMatchObject({
    actionId: submitted?.actionId,
    localSequence: 1,
    state: 'pending',
  }));

  await act(async () => { releaseWake(); });
});

it('uses only the newest matching action from the current safe provider view', async () => {
  jest.mocked(useAgentSync).mockReturnValue(syncView([
    action('older', 1, 'pending'),
    { ...action('newest', 4, 'pending'), blockedReason: 'authorization' },
    action('foreign-vendor', 9, 'conflict', 'vendor-b'),
    action('foreign-stop', 10, 'failed_retryable', 'vendor-a', 'stop-b'),
  ]));

  const { result } = await setup();

  expect(result.current.action).toEqual({
    actionId: 'newest',
    localSequence: 4,
    state: 'pending',
    blockedReason: 'authorization',
  });
});

it('reports provider hydration before treating an empty safe action view as authoritative', async () => {
  jest.mocked(useAgentSync).mockReturnValue({
    ...syncView(),
    actionsHydrated: false,
  });

  const { result } = await setup();

  expect(result.current.actionsHydrated).toBe(false);
  expect(result.current.action).toBeUndefined();
});

it('does not retry a failed local insert or wake the network runner', async () => {
  jest.mocked(enqueueAction).mockRejectedValue(new Error('disk unavailable'));
  const { result } = await setup();

  await act(async () => {
    await expect(result.current.submit(body)).rejects.toThrow('disk unavailable');
  });
  await waitFor(() => expect(result.current.error).toEqual(
    new Error('disk unavailable'),
  ));

  expect(enqueueAction).toHaveBeenCalledTimes(1);
  expect(syncNow).not.toHaveBeenCalled();
});

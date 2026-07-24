import { act, render, waitFor } from '@testing-library/react-native';
import { Component, useEffect, type ReactNode } from 'react';
import { AppState, Text } from 'react-native';
import { addEventListener as addNetInfoListener } from '@react-native-community/netinfo';

import {
  AgentSyncProvider,
  useAgentSync,
  type AgentSyncView,
} from '../AgentSyncProvider';
import { createSyncRunner } from '../sync-runner';

const mockDatabase = { db: true };
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDatabase }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));
jest.mock('../sync-runner', () => ({ createSyncRunner: jest.fn() }));

const createRunner = createSyncRunner as jest.Mock;
const listenToNetInfo = addNetInfoListener as jest.Mock;
let appStateListener: ((state: string) => void) | undefined;
let netInfoListener:
  | ((state: Readonly<{ isConnected: boolean | null }>) => void)
  | undefined;
const captureView = jest.fn<void, [AgentSyncView]>();

describe('agent synchronization view contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = undefined;
    netInfoListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      ((_event: string, listener: (state: string) => void) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      }) as typeof AppState.addEventListener,
    );
    listenToNetInfo.mockImplementation(
      (listener: typeof netInfoListener) => {
        netInfoListener = listener;
        return jest.fn();
      },
    );
  });

  afterEach(() => jest.restoreAllMocks());

  test('fails closed outside the authenticated synchronization provider', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation();
    try {
      const view = await render(
        <TestErrorBoundary>
          <MissingProviderProbe />
        </TestErrorBoundary>,
      );

      expect(
        view.getByText('Agent synchronization provider is unavailable'),
      ).toBeTruthy();
    } finally {
      errorLog.mockRestore();
    }
  });

  test('starts one scoped runner and exposes only a safe scope-filtered projection', async () => {
    const runner = mockRunner();
    createRunner.mockReturnValue(runner);

    await render(
      <AgentSyncProvider
        scope={{
          actorId: 'actor-1',
          deviceId: 'device-1',
          accessMode: 'standard',
        }}
        accessToken="access-1"
      >
        <SyncProbe />
      </AgentSyncProvider>,
    );

    await waitFor(() => expect(runner.wake).toHaveBeenCalledTimes(1));
    expect(createRunner).toHaveBeenCalledTimes(1);
    expect(createRunner.mock.calls[0]![0]).toMatchObject({
      scope: {
        actorId: 'actor-1',
        deviceId: 'device-1',
        accessMode: 'standard',
      },
    });
    expect(currentView().groups).toEqual([
      expect.objectContaining({ vendorId: 'vendor-1', synced: 1 }),
    ]);
    const action = currentView().getAction('action-1');
    expect(action).toMatchObject({
      actionId: 'action-1',
      vendorId: 'vendor-1',
      state: 'synced',
      request: { localSequence: 1 },
      serverResponse: { routeStopId: 'stop-1' },
    });
    expect(action).not.toHaveProperty('actorId');
    expect(action).not.toHaveProperty('deviceId');
    expect(action).not.toHaveProperty('idempotencyKey');
  });

  test('joins foreground, reconnect, manual, retry, and refreshed-token wakes to the same runner', async () => {
    const runner = mockRunner();
    createRunner.mockReturnValue(runner);
    const scope = {
      actorId: 'actor-1',
      deviceId: 'device-1',
      accessMode: 'standard' as const,
    };
    const view = await render(
      <AgentSyncProvider scope={scope} accessToken="access-1">
        <SyncProbe />
      </AgentSyncProvider>,
    );
    await waitFor(() => expect(runner.wake).toHaveBeenCalledTimes(1));

    await act(async () => {
      appStateListener?.('active');
      netInfoListener?.({ isConnected: false });
      netInfoListener?.({ isConnected: true });
      await currentView().syncNow();
      await currentView().retryNow('action-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(runner.wake).toHaveBeenCalledTimes(4);
    expect(runner.retryNow).toHaveBeenCalledWith('action-1');
    expect(createRunner).toHaveBeenCalledTimes(1);

    await view.rerender(
      <AgentSyncProvider scope={scope} accessToken="access-2">
        <SyncProbe />
      </AgentSyncProvider>,
    );
    await waitFor(() =>
      expect(runner.resumeAuthentication).toHaveBeenCalledTimes(1),
    );
    expect(runner.wake).toHaveBeenCalledTimes(5);
    expect(createRunner).toHaveBeenCalledTimes(1);
    expect(runner.setAccessToken).toHaveBeenLastCalledWith('access-2');
  });
});

function MissingProviderProbe() {
  useAgentSync();
  return <Text>Unexpected synchronization access</Text>;
}

function SyncProbe() {
  const view = useAgentSync();
  useEffect(() => captureView(view), [view]);
  return <Text>{view.status}</Text>;
}

function mockRunner() {
  return {
    status: 'idle' as const,
    setAccessToken: jest.fn(),
    wake: jest.fn().mockResolvedValue(undefined),
    retryNow: jest.fn().mockResolvedValue(undefined),
    resumeAuthentication: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn().mockResolvedValue({
      groups: [
        {
          vendorId: 'vendor-1',
          pending: 0,
          sending: 0,
          synced: 1,
          failedRetryable: 0,
          conflict: 0,
          oldestPendingAtMs: null,
          routeFreshness: 'fresh',
          lastRouteSyncAtMs: 9_000,
          lastActionSyncAtMs: 10_000,
        },
      ],
      actions: [
        {
          actionId: 'action-1',
          idempotencyKey: 'secret-key',
          localSequence: 1,
          actorId: 'actor-1',
          vendorId: 'vendor-1',
          deviceId: 'device-1',
          routeStopId: 'stop-1',
          serviceDate: '2026-07-24',
          routeSyncId: 'sync-1',
          payloadVersion: 1,
          occurredAt: '2026-07-24T05:30:00.000Z',
          request: {
            routeSyncId: 'sync-1',
            payloadVersion: 1,
            localSequence: 1,
            serviceDate: '2026-07-24',
            occurredAt: '2026-07-24T05:30:00.000Z',
            outcome: 'delivered',
            items: [],
          },
          display: {
            routeId: 'route-1',
            routeName: 'Route One',
            routeStopId: 'stop-1',
            sequence: 1,
            householdName: 'Household One',
            householdAccountNumber: 'H-1',
            outcome: 'delivered',
            plannedItems: [],
          },
          leaseServerTimeMs: 1_000,
          leaseExpiresAtMs: 20_000,
          leaseSavedAtWallMs: 1_000,
          retentionDeleteAfterWallMs: 20_000,
          state: 'synced',
          blockedReason: null,
          attemptCount: 1,
          nextAttemptAtMs: null,
          lastHttpStatus: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorCorrelationId: null,
          serverResponse: { routeStopId: 'stop-1' },
          conflictId: null,
          syncedAtMs: 10_000,
          createdAtMs: 9_000,
          updatedAtMs: 10_000,
        },
      ],
    }),
  };
}

function currentView() {
  const view = captureView.mock.calls.at(-1)?.[0];
  if (!view) throw new Error('Synchronization view unavailable');
  return view;
}

class TestErrorBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  Readonly<{ message?: string }>
> {
  state: Readonly<{ message?: string }> = {};

  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error ? error.message : 'Unknown synchronization error',
    };
  }

  render() {
    if (this.state.message) {
      return <Text>{this.state.message}</Text>;
    }
    return this.props.children;
  }
}

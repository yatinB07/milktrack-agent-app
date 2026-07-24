import { api } from '@/api/client';
import {
  OfflineApiError,
  reportSyncCheckpoint,
  submitOfflineOutcome,
} from '../api';

jest.mock('@/api/client', () => ({
  api: { POST: jest.fn(), PUT: jest.fn() },
}));

const post = api.POST as jest.Mock;
const put = api.PUT as jest.Mock;
const request = {
  routeSyncId: 'route-sync-1',
  payloadVersion: 1 as const,
  localSequence: 7,
  serviceDate: '2026-07-24',
  occurredAt: '2026-07-24T05:30:00.000Z',
  outcome: 'delivered' as const,
  items: [
    {
      scheduledDeliveryId: 'delivery-1',
      expectedVersion: 2,
      actualQuantity: '1.25',
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

test('replays the stored body and idempotency key unchanged', async () => {
  const response = {
    routeStopId: 'route-stop-1',
    serviceDate: '2026-07-24',
    outcome: 'delivered',
    items: [],
  };
  post.mockResolvedValueOnce({
    data: response,
    response: { status: 201, headers: { get: jest.fn() } },
  });

  await expect(
    submitOfflineOutcome({
      vendorId: 'vendor-1',
      routeStopId: 'route-stop-1',
      accessToken: 'access-token',
      idempotencyKey: 'immutable-key',
      request,
    }),
  ).resolves.toEqual({ kind: 'synced', response });
  expect(post).toHaveBeenCalledWith(
    '/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes/offline',
    {
      body: request,
      headers: { authorization: 'Bearer access-token' },
      params: {
        header: { 'Idempotency-Key': 'immutable-key' },
        path: { vendorId: 'vendor-1', routeStopId: 'route-stop-1' },
      },
    },
  );
  expect(post.mock.calls[0]![1].body).toBe(request);
});

test('accepts only a retained pending conflict as a conflict result', async () => {
  const conflict = {
    code: 'OFFLINE_OUTCOME_CONFLICT',
    conflictId: 'conflict-1',
    conflictStatus: 'pending',
    correlationId: 'correlation-1',
    message: 'Vendor review required',
    retryable: false,
  };
  post.mockResolvedValueOnce({
    error: conflict,
    response: { status: 409, headers: { get: jest.fn() } },
  });

  await expect(
    submitOfflineOutcome({
      vendorId: 'vendor-1',
      routeStopId: 'route-stop-1',
      accessToken: 'access-token',
      idempotencyKey: 'immutable-key',
      request,
    }),
  ).resolves.toEqual({ kind: 'conflict', response: conflict });

  post.mockResolvedValueOnce({
    error: {
      code: 'IDEMPOTENCY_KEY_REUSED',
      correlationId: 'correlation-2',
      message: 'Request differs',
      retryable: false,
    },
    response: { status: 409, headers: { get: jest.fn() } },
  });
  await expect(
    submitOfflineOutcome({
      vendorId: 'vendor-1',
      routeStopId: 'route-stop-1',
      accessToken: 'access-token',
      idempotencyKey: 'immutable-key',
      request,
    }),
  ).rejects.toMatchObject({
    httpStatus: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
    retryable: false,
  });
});

test('returns typed stable error metadata and the Retry-After header', async () => {
  post.mockResolvedValueOnce({
    error: {
      code: 'OFFLINE_ACTION_PROCESSING',
      correlationId: 'correlation-1',
      message: 'Processing',
      retryAfterSeconds: 9,
      retryable: true,
    },
    response: {
      status: 503,
      headers: { get: jest.fn().mockReturnValue('12') },
    },
  });

  const error = await submitOfflineOutcome({
    vendorId: 'vendor-1',
    routeStopId: 'route-stop-1',
    accessToken: 'access-token',
    idempotencyKey: 'immutable-key',
    request,
  }).catch((cause: unknown) => cause);

  expect(error).toBeInstanceOf(OfflineApiError);
  expect(error).toMatchObject({
    httpStatus: 503,
    code: 'OFFLINE_ACTION_PROCESSING',
    retryable: true,
    correlationId: 'correlation-1',
    retryAfterSeconds: 9,
    retryAfterHeader: '12',
  });
});

test('treats transport ambiguity as retryable without leaking its message', async () => {
  post.mockRejectedValueOnce(new TypeError('secret network details'));

  await expect(
    submitOfflineOutcome({
      vendorId: 'vendor-1',
      routeStopId: 'route-stop-1',
      accessToken: 'access-token',
      idempotencyKey: 'immutable-key',
      request,
    }),
  ).rejects.toEqual(
    expect.objectContaining({
      message: 'Offline synchronization unavailable',
      httpStatus: null,
      retryable: true,
    }),
  );
});

test('reports the generated checkpoint contract and requires 204', async () => {
  const body = {
    pendingCount: 1,
    sendingCount: 0,
    failedRetryableCount: 2,
    conflictCount: 3,
    oldestPendingAt: '2026-07-24T05:30:00.000Z',
    lastRouteSyncAt: '2026-07-24T05:00:00.000Z',
    lastActionSyncAt: '2026-07-24T05:15:00.000Z',
  };
  put.mockResolvedValueOnce({
    response: { status: 204, headers: { get: jest.fn() } },
  });

  await expect(
    reportSyncCheckpoint({
      vendorId: 'vendor-1',
      accessToken: 'access-token',
      body,
    }),
  ).resolves.toBeUndefined();
  expect(put).toHaveBeenCalledWith(
    '/v1/agent/vendors/{vendorId}/sync-checkpoint',
    {
      body,
      headers: { authorization: 'Bearer access-token' },
      params: { path: { vendorId: 'vendor-1' } },
    },
  );
});

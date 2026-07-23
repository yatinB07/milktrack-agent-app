import { api } from '@/api/client';
import { postStopOutcome, StopOutcomeError } from '../api';
import type { StopOutcomeRequest, StopOutcomeResult } from '../types';

jest.mock('@/api/client', () => ({ api: { POST: jest.fn() } }));

const post = api.POST as jest.Mock;
const body: StopOutcomeRequest = {
  serviceDate: '2026-07-23',
  occurredAt: '2026-07-23T01:05:00.000Z',
  outcome: 'delivered',
  items: [{
    scheduledDeliveryId: '11111111-1111-4111-8111-111111111111',
    expectedVersion: 2,
    actualQuantity: '1.25',
  }],
};
const authoritativeStop = {
  routeStopId: '22222222-2222-4222-8222-222222222222',
  serviceDate: '2026-07-23',
  outcome: 'delivered',
  items: [],
} satisfies StopOutcomeResult;
const request = {
  vendorId: 'vendor-a',
  routeStopId: 'stop-a',
  accessToken: 'secret',
  body,
};

beforeEach(() => jest.clearAllMocks());

it('posts the complete stop exactly once', async () => {
  post.mockResolvedValue({ data: authoritativeStop, response: { status: 201 } });

  await expect(postStopOutcome(request)).resolves.toEqual(authoritativeStop);

  expect(post).toHaveBeenCalledWith(
    '/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes',
    {
      headers: { authorization: 'Bearer secret' },
      params: { path: { vendorId: 'vendor-a', routeStopId: 'stop-a' } },
      body,
    },
  );
  expect(post).toHaveBeenCalledTimes(1);
});

it.each([
  [401, 'authentication'],
  [403, 'forbidden'],
  [400, 'invalid'],
  [422, 'invalid'],
  [503, 'ambiguous'],
] as const)('classifies status %s as %s without exposing the response', async (status, kind) => {
  post.mockResolvedValue({
    error: { code: 'SENSITIVE_CODE', message: 'sensitive response body' },
    response: { status },
  });

  const error = await postStopOutcome(request).catch((cause: unknown) => cause);

  expect(error).toBeInstanceOf(StopOutcomeError);
  expect(error).toMatchObject({ kind, code: 'SENSITIVE_CODE' });
  expect((error as Error).message).not.toContain('sensitive');
  expect((error as Error).message).not.toContain(request.accessToken);
});

it('preserves the typed 409 conflict code for authoritative recovery', async () => {
  post.mockResolvedValue({
    error: { code: 'STALE_VERSION', message: 'stale' },
    response: { status: 409 },
  });

  await expect(postStopOutcome(request)).rejects.toMatchObject({
    kind: 'conflict',
    code: 'STALE_VERSION',
  });
  expect(post).toHaveBeenCalledTimes(1);
});

it('classifies a thrown transport failure as ambiguous without retrying', async () => {
  post.mockRejectedValue(new TypeError('request containing secret failed'));

  const error = await postStopOutcome(request).catch((cause: unknown) => cause);

  expect(error).toMatchObject({ kind: 'ambiguous' });
  expect((error as Error).message).toBe('ambiguous');
  expect(post).toHaveBeenCalledTimes(1);
});

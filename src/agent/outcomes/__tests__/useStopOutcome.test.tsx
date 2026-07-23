import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as outcomeApi from '../api';
import { StopOutcomeError } from '../api';
import type { StopOutcomeRequest, StopOutcomeResult } from '../types';
import { useStopOutcome } from '../useStopOutcome';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, postStopOutcome: jest.fn() };
});

const input = { vendorId: 'vendor-a', routeStopId: 'stop-a', accessToken: 'secret' };
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
const authoritativeStop = {
  routeStopId: '22222222-2222-4222-8222-222222222222',
  serviceDate: '2026-07-23',
  outcome: 'missed',
  items: [],
} satisfies StopOutcomeResult;

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

beforeEach(() => jest.clearAllMocks());

it('submits once, exposes the authoritative result, and resets state', async () => {
  jest.mocked(outcomeApi.postStopOutcome).mockResolvedValue(authoritativeStop);
  const { result } = await setup();

  await act(() => result.current.submit(body));

  expect(outcomeApi.postStopOutcome).toHaveBeenCalledWith({ ...input, body });
  expect(outcomeApi.postStopOutcome).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(result.current.result).toEqual(authoritativeStop));
  expect(result.current.error).toBeUndefined();
  expect(result.current.requiresAuthoritativeRefetch).toBe(false);

  await act(async () => { result.current.reset(); });
  await waitFor(() => expect(result.current.result).toBeUndefined());
});

it.each([
  ['conflict', true],
  ['ambiguous', true],
  ['authentication', false],
  ['forbidden', false],
  ['invalid', false],
] as const)('does not retry %s failures and reports refetch requirement as %s', async (kind, refetch) => {
  jest.mocked(outcomeApi.postStopOutcome).mockRejectedValue(new StopOutcomeError(kind, 'CODE'));
  const { result } = await setup();

  await act(async () => {
    await expect(result.current.submit(body)).rejects.toMatchObject({ kind });
  });
  await waitFor(() => expect(result.current.error).toMatchObject({ kind }));

  expect(outcomeApi.postStopOutcome).toHaveBeenCalledTimes(1);
  expect(result.current.requiresAuthoritativeRefetch).toBe(refetch);
});

it('exposes pending while the one request is unresolved', async () => {
  let resolve!: (value: StopOutcomeResult) => void;
  jest.mocked(outcomeApi.postStopOutcome).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result } = await setup();

  let submission!: Promise<StopOutcomeResult>;
  await act(async () => {
    submission = result.current.submit(body);
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current.pending).toBe(true));

  await act(async () => { resolve(authoritativeStop); await submission; });
  await waitFor(() => expect(result.current.pending).toBe(false));
});

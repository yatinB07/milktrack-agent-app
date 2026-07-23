import { api } from '@/api/client';
import type { StopOutcomeRequest, StopOutcomeResult } from './types';

export type StopOutcomeInput = Readonly<{
  vendorId: string;
  routeStopId: string;
  accessToken: string;
  body: StopOutcomeRequest;
}>;
export type StopOutcomeErrorKind =
  | 'authentication'
  | 'forbidden'
  | 'conflict'
  | 'invalid'
  | 'ambiguous';

export class StopOutcomeError extends Error {
  constructor(readonly kind: StopOutcomeErrorKind, readonly code?: string) {
    super(kind);
    this.name = 'StopOutcomeError';
  }
}

export async function postStopOutcome(input: StopOutcomeInput): Promise<StopOutcomeResult> {
  let result;
  try {
    result = await api.POST(
      '/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes',
      {
        headers: { authorization: `Bearer ${input.accessToken}` },
        params: {
          path: { vendorId: input.vendorId, routeStopId: input.routeStopId },
        },
        body: input.body,
      },
    );
  } catch {
    throw new StopOutcomeError('ambiguous');
  }

  if (result.data) return result.data;

  const status = result.response.status;
  const error = result.error as { code?: string } | undefined;
  throw new StopOutcomeError(
    status === 401
      ? 'authentication'
      : status === 403
        ? 'forbidden'
        : status === 409
          ? 'conflict'
          : status === 400 || status === 422
            ? 'invalid'
            : 'ambiguous',
    error?.code,
  );
}

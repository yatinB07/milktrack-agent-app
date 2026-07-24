import { api } from '@/api/client';
import type { components } from '@/api/schema';
import type { OfflineOutcomeRequest } from './types';

type OutcomeResponse =
  components['schemas']['AgentStopOutcomeResponseDto'];
export type OutcomeConflict =
  components['schemas']['OfflineOutcomeConflictResponseDto'];
export type SyncCheckpoint =
  components['schemas']['SyncCheckpointRequestDto'];
type ApiError = components['schemas']['ApiErrorResponseDto'];

export type OfflineOutcomeResult =
  | Readonly<{ kind: 'synced'; response: OutcomeResponse }>
  | Readonly<{ kind: 'conflict'; response: OutcomeConflict }>;

export class OfflineApiError extends Error {
  readonly name = 'OfflineApiError';

  constructor(
    readonly httpStatus: number | null,
    readonly code: string | undefined,
    readonly retryable: boolean,
    readonly correlationId: string | undefined,
    readonly retryAfterSeconds: number | undefined,
    readonly retryAfterHeader: string | null,
    message = 'Offline synchronization unavailable',
  ) {
    super(message);
  }
}

export async function submitOfflineOutcome(input: Readonly<{
  vendorId: string;
  routeStopId: string;
  accessToken: string;
  idempotencyKey: string;
  request: OfflineOutcomeRequest;
}>): Promise<OfflineOutcomeResult> {
  try {
    const { data, error, response } = await api.POST(
      '/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes/offline',
      {
        body: input.request,
        headers: { authorization: `Bearer ${input.accessToken}` },
        params: {
          header: { 'Idempotency-Key': input.idempotencyKey },
          path: {
            vendorId: input.vendorId,
            routeStopId: input.routeStopId,
          },
        },
      },
    );
    if (response.status === 201 && data) {
      return { kind: 'synced', response: data };
    }
    if (response.status === 409 && isRetainedConflict(error)) {
      return { kind: 'conflict', response: error };
    }
    throw toApiError(response.status, error, response.headers);
  } catch (error) {
    if (error instanceof OfflineApiError) throw error;
    throw new OfflineApiError(null, undefined, true, undefined, undefined, null);
  }
}

export async function reportSyncCheckpoint(input: Readonly<{
  vendorId: string;
  accessToken: string;
  body: SyncCheckpoint;
}>): Promise<void> {
  try {
    const { error, response } = await api.PUT(
      '/v1/agent/vendors/{vendorId}/sync-checkpoint',
      {
        body: input.body,
        headers: { authorization: `Bearer ${input.accessToken}` },
        params: { path: { vendorId: input.vendorId } },
      },
    );
    if (response.status !== 204) {
      throw toApiError(response.status, error, response.headers);
    }
  } catch (error) {
    if (error instanceof OfflineApiError) throw error;
    throw new OfflineApiError(null, undefined, true, undefined, undefined, null);
  }
}

function isRetainedConflict(value: unknown): value is OutcomeConflict {
  if (!value || typeof value !== 'object') return false;
  const conflict = value as Record<string, unknown>;
  return (
    typeof conflict.code === 'string' &&
    typeof conflict.conflictId === 'string' &&
    conflict.conflictStatus === 'pending' &&
    typeof conflict.correlationId === 'string' &&
    typeof conflict.message === 'string' &&
    conflict.retryable === false
  );
}

function toApiError(
  httpStatus: number,
  value: unknown,
  headers: Pick<Headers, 'get'>,
) {
  const error = isApiError(value) ? value : undefined;
  return new OfflineApiError(
    httpStatus,
    error?.code,
    error?.retryable ?? (httpStatus === 429 || httpStatus === 503),
    error?.correlationId,
    error?.retryAfterSeconds,
    headers.get('Retry-After'),
    error?.message,
  );
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') return false;
  const error = value as Record<string, unknown>;
  return (
    typeof error.code === 'string' &&
    typeof error.correlationId === 'string' &&
    typeof error.message === 'string' &&
    typeof error.retryable === 'boolean' &&
    (error.retryAfterSeconds === undefined ||
      typeof error.retryAfterSeconds === 'number')
  );
}

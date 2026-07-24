import type { RouteLease } from './types';

export type Clock = () => number;
export const systemClock: Clock = () => Date.now();

export type LeaseFreshness = 'fresh' | 'stale' | 'clock_rollback';

export function parseRouteLease(
  serverTime: string,
  expiresAt: string,
  savedAtWallMs: number,
): RouteLease {
  const serverTimeMs = Date.parse(serverTime);
  const expiresAtMs = Date.parse(expiresAt);
  const retentionDeleteAfterWallMs =
    savedAtWallMs + (expiresAtMs - serverTimeMs);

  if (
    ![serverTimeMs, expiresAtMs, savedAtWallMs, retentionDeleteAfterWallMs].every(
      Number.isSafeInteger,
    ) ||
    expiresAtMs <= serverTimeMs
  ) {
    throw new Error('Invalid route lease');
  }

  return {
    serverTimeMs,
    expiresAtMs,
    savedAtWallMs,
    retentionDeleteAfterWallMs,
  };
}

export function getLeaseFreshness(
  lease: Pick<RouteLease, 'serverTimeMs' | 'expiresAtMs' | 'savedAtWallMs'>,
  clock: Clock = systemClock,
): LeaseFreshness {
  const now = clock();
  if (
    ![lease.serverTimeMs, lease.expiresAtMs, lease.savedAtWallMs, now].every(
      Number.isFinite,
    ) ||
    lease.expiresAtMs <= lease.serverTimeMs
  ) {
    return 'stale';
  }

  const elapsed = now - lease.savedAtWallMs;
  if (elapsed < 0) return 'clock_rollback';
  return lease.serverTimeMs + elapsed >= lease.expiresAtMs ? 'stale' : 'fresh';
}

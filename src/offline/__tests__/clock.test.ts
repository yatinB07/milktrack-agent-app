import {
  getLeaseFreshness,
  parseRouteLease,
  systemClock,
} from '../clock';

describe('offline lease clock', () => {
  const savedAtWallMs = Date.parse('2026-07-24T00:00:00.000Z');
  const serverTime = '2026-07-24T00:00:10.000Z';
  const expiresAt = '2026-07-25T00:00:10.000Z';

  test('parses the server lease once and derives its safe retention time', () => {
    expect(parseRouteLease(serverTime, expiresAt, savedAtWallMs)).toEqual({
      serverTimeMs: Date.parse(serverTime),
      expiresAtMs: Date.parse(expiresAt),
      savedAtWallMs,
      retentionDeleteAfterWallMs: savedAtWallMs + 86_400_000,
    });
  });

  test.each([
    ['fresh before expiry', savedAtWallMs + 86_399_999, 'fresh'],
    ['stale at exact expiry', savedAtWallMs + 86_400_000, 'stale'],
    ['stale after a forward jump', savedAtWallMs + 90_000_000, 'stale'],
    ['stale after clock rollback', savedAtWallMs - 1, 'clock_rollback'],
  ] as const)('%s', (_name, now, expected) => {
    const lease = parseRouteLease(serverTime, expiresAt, savedAtWallMs);

    expect(getLeaseFreshness(lease, () => now)).toBe(expected);
  });

  test('treats invalid and non-finite persisted lease values as stale', () => {
    expect(
      getLeaseFreshness(
        {
          serverTimeMs: Number.NaN,
          expiresAtMs: Number.POSITIVE_INFINITY,
          savedAtWallMs,
        },
        () => savedAtWallMs,
      ),
    ).toBe('stale');
    expect(() =>
      parseRouteLease('invalid', expiresAt, savedAtWallMs),
    ).toThrow('Invalid route lease');
  });

  test('uses the wall clock by default', () => {
    expect(systemClock()).toBe(Date.now());
  });
});

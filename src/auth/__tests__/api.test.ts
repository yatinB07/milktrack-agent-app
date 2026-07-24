import { api } from '@/api/client';
import { AuthError, getCurrentActor, logout, refreshSession, requestOtp, verifyOtp } from '../api';

jest.mock('@/api/client', () => ({ api: { POST: jest.fn() } }));

const post = api.POST as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('requests a sign-in challenge with an E.164 phone number', async () => {
  const challenge = { accepted: true, challengeToken: 'c'.repeat(43), expiresAt: '2026-07-19T12:00:00.000Z' } as const;
  post.mockResolvedValueOnce({ data: challenge });

  await expect(requestOtp('+919876543210')).resolves.toEqual(challenge);
  expect(post).toHaveBeenCalledWith('/v1/auth/otp/request', { body: { phone: '+919876543210', purpose: 'sign_in' } });
});

it('binds a recovery challenge to the selected opaque route lease', async () => {
  const challenge = { accepted: true, challengeToken: 'c'.repeat(43), expiresAt: '2026-07-19T12:00:00.000Z' } as const;
  post.mockResolvedValueOnce({ data: challenge });

  await expect(requestOtp('+919876543210', 'route-sync-1')).resolves.toEqual(challenge);
  expect(post).toHaveBeenCalledWith('/v1/auth/otp/request', {
    body: {
      phone: '+919876543210',
      purpose: 'sign_in',
      routeSyncId: 'route-sync-1',
    },
  });
});

it('verifies OTP as a mobile client on the current device', async () => {
  const session = { accessToken: 'access', accessExpiresAt: '2026-07-19T12:15:00.000Z', refreshToken: 'refresh', refreshExpiresAt: '2026-08-19T12:00:00.000Z' };
  post.mockResolvedValueOnce({ data: session });

  await expect(verifyOtp('c'.repeat(43), '123456', 'agent-device')).resolves.toEqual(session);
  expect(post).toHaveBeenCalledWith('/v1/auth/otp/verify', { body: { challengeToken: 'c'.repeat(43), code: '123456', deviceId: 'agent-device', clientType: 'mobile' } });
});

it('exposes neutral rate-limit metadata without leaking backend details', async () => {
  post.mockResolvedValueOnce({ error: { code: 'RATE_LIMITED', message: 'internal', retryAfterSeconds: 30 } });

  await expect(requestOtp('+919876543210')).rejects.toEqual(new AuthError('Try again later', 30));
});

it('rotates a mobile refresh token for the same device', async () => {
  const session = { accessToken: 'new-access', accessExpiresAt: '2026-07-19T12:15:00.000Z', refreshToken: 'new-refresh', refreshExpiresAt: '2026-08-19T12:00:00.000Z' };
  post.mockResolvedValueOnce({ data: session });

  await expect(refreshSession('refresh', 'agent-device')).resolves.toEqual(session);
  expect(post).toHaveBeenCalledWith('/v1/auth/refresh', { body: { refreshToken: 'refresh', deviceId: 'agent-device', clientType: 'mobile' } });
});

it('reads the actor and logs out with the in-memory access token', async () => {
  const actor = { userId: 'user', displayName: 'Agent A', platformRoles: [], memberships: [], sessionId: 'session' };
  (api as unknown as { GET: jest.Mock }).GET = jest.fn().mockResolvedValueOnce({ data: actor });
  post.mockResolvedValueOnce({ response: { status: 204 } });

  await expect(getCurrentActor('access')).resolves.toEqual(actor);
  expect((api as unknown as { GET: jest.Mock }).GET).toHaveBeenCalledWith('/v1/auth/me', { headers: { authorization: 'Bearer access' } });
  await expect(logout('access')).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledWith('/v1/auth/logout', { params: { header: { authorization: 'Bearer access' } } });
});

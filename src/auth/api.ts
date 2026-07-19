import { api } from '@/api/client';
import type { components } from '@/api/schema';

type Challenge = components['schemas']['OtpChallengeResponseDto'];
export type Session = components['schemas']['SessionResponseDto'];
export type Actor = components['schemas']['CurrentActorResponseDto'];

export class AuthError extends Error {
  constructor(message: string, readonly retryAfterSeconds?: number, readonly code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function failure(error?: components['schemas']['ApiErrorResponseDto']): AuthError {
  return error?.code === 'RATE_LIMITED'
    ? new AuthError('Try again later', error.retryAfterSeconds, error.code)
    : new AuthError('Authentication failed', undefined, error?.code);
}

export async function requestOtp(phone: string): Promise<Challenge> {
  const { data, error } = await api.POST('/v1/auth/otp/request', {
    body: { phone, purpose: 'sign_in' },
  });
  if (!data) throw failure(error);
  return data;
}

export async function verifyOtp(
  challengeToken: string,
  code: string,
  deviceId: string,
): Promise<Session> {
  const { data, error } = await api.POST('/v1/auth/otp/verify', {
    body: { challengeToken, code, deviceId, clientType: 'mobile' },
  });
  if (!data) throw failure(error);
  return data;
}

export async function refreshSession(refreshToken: string, deviceId: string): Promise<Session> {
  const { data, error } = await api.POST('/v1/auth/refresh', {
    body: { refreshToken, deviceId, clientType: 'mobile' },
  });
  if (!data) throw failure(error);
  return data;
}

export async function getCurrentActor(accessToken: string): Promise<Actor> {
  const { data, error } = await api.GET('/v1/auth/me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!data) throw failure(error);
  return data;
}

export async function logout(accessToken: string): Promise<void> {
  const { error } = await api.POST('/v1/auth/logout', {
    params: { header: { authorization: `Bearer ${accessToken}` } },
  });
  if (error) throw failure(error);
}

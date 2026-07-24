import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AuthError, getCurrentActor, logout, refreshSession, requestOtp, verifyOtp, type Actor, type Session } from './api';
import { clearRefreshToken, getOrCreateDeviceId, loadRefreshToken, saveLastAuthenticatedOfflineScope, saveRefreshToken } from './storage';
import type { OfflineAccessScope } from '@/offline/types';

type Status = 'loading' | 'anonymous' | 'authenticated' | 'access-unavailable' | 'permission-denied' | 'service-unavailable';
type Challenge = Readonly<{ phone: string; token: string; expiresAt: string }>;
type AuthValue = Readonly<{
  status: Status;
  actor?: Actor;
  accessToken?: string;
  deviceId?: string;
  offlineScope?: OfflineAccessScope;
  challenge?: Challenge;
  requestCode(phone: string): Promise<void>;
  verifyCode(code: string): Promise<void>;
  retrySession(): Promise<void>;
  signOut(): Promise<void>;
}>;

const AuthContext = createContext<AuthValue | undefined>(undefined);

function accessStatus(actor: Actor): Status {
  if (actor.accessMode === 'offline_recovery') {
    return actor.recoveryRouteSyncId
      ? 'authenticated'
      : 'permission-denied';
  }
  if (actor.memberships.some(({ role, status }) => role === 'delivery_agent' && status === 'active')) return 'authenticated';
  if (actor.memberships.length > 0) return 'permission-denied';
  return 'access-unavailable';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Status>('loading');
  const [actor, setActor] = useState<Actor>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [access, setAccess] = useState<Pick<Session, 'accessToken' | 'accessExpiresAt'>>();
  const [deviceId, setDeviceId] = useState<string>();
  const [offlineScope, setOfflineScope] = useState<OfflineAccessScope>();
  const refreshFlight = useRef<Promise<void> | undefined>(undefined);
  const signOutFlight = useRef<Promise<void> | undefined>(undefined);

  const acceptSession = useCallback(async (session: Session, currentDeviceId: string) => {
    if (!session.refreshToken) throw new Error('Mobile session did not include a refresh credential');
    await saveRefreshToken(session.refreshToken);
    setStatus('loading');
    setAccess({ accessToken: session.accessToken, accessExpiresAt: session.accessExpiresAt });
    setActor(undefined);
    setOfflineScope(undefined);
    try {
      const current = await getCurrentActor(session.accessToken);
      const nextStatus = accessStatus(current);
      const nextScope = authenticatedScope(current, currentDeviceId);
      if (nextStatus === 'authenticated' && nextScope) {
        await saveLastAuthenticatedOfflineScope(nextScope);
      }
      setActor(current);
      setDeviceId(currentDeviceId);
      setOfflineScope(nextStatus === 'authenticated' ? nextScope : undefined);
      setStatus(nextStatus);
    } catch (cause) {
      if (cause instanceof AuthError && cause.code === 'AUTHENTICATION_FAILED') {
        await clearRefreshToken();
        setAccess(undefined);
        setActor(undefined);
        setDeviceId(undefined);
        setOfflineScope(undefined);
        setStatus('anonymous');
        throw cause;
      }
      setStatus('service-unavailable');
    }
  }, []);

  const restoreSession = useCallback(async () => {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) return setStatus('anonymous');
    try {
      const deviceId = await getOrCreateDeviceId();
      await acceptSession(await refreshSession(refreshToken, deviceId), deviceId);
    } catch (cause) {
      if (cause instanceof AuthError && cause.code === 'AUTHENTICATION_FAILED') {
        await clearRefreshToken();
        setAccess(undefined);
        setActor(undefined);
        setDeviceId(undefined);
        setOfflineScope(undefined);
        setStatus('anonymous');
      } else setStatus('service-unavailable');
    }
  }, [acceptSession]);

  const retrySession = useCallback(() => {
    if (signOutFlight.current) return signOutFlight.current;
    if (!refreshFlight.current) {
      refreshFlight.current = restoreSession().finally(() => { refreshFlight.current = undefined; });
    }
    return refreshFlight.current;
  }, [restoreSession]);

  useEffect(() => {
    const timer = setTimeout(() => void retrySession(), 0);
    return () => clearTimeout(timer);
  }, [retrySession]);

  useEffect(() => {
    if (!access) return;
    const delay = Math.max(0, Math.min(Date.parse(access.accessExpiresAt) - Date.now() - 30_000, 2_147_000_000));
    const timer = setTimeout(() => void retrySession(), delay);
    return () => clearTimeout(timer);
  }, [access, retrySession]);

  const requestCode = useCallback(async (phone: string) => {
    const result = await requestOtp(`+91${phone}`);
    setChallenge({ phone, token: result.challengeToken, expiresAt: result.expiresAt });
  }, []);

  const verifyCode = useCallback(async (code: string) => {
    if (!challenge) throw new Error('Request a new code');
    const deviceId = await getOrCreateDeviceId();
    await acceptSession(await verifyOtp(challenge.token, code, deviceId), deviceId);
    setChallenge(undefined);
  }, [acceptSession, challenge]);

  const signOut = useCallback(async () => {
    if (signOutFlight.current) return signOutFlight.current;
    const task = (async () => {
      try {
        if (refreshFlight.current) await refreshFlight.current;
        const refreshToken = await loadRefreshToken();
        let accessToken = access?.accessToken;
        if (refreshToken) {
          const deviceId = await getOrCreateDeviceId();
          const rotated = await refreshSession(refreshToken, deviceId);
          if (!rotated.refreshToken) throw new Error('Mobile session did not include a refresh credential');
          await saveRefreshToken(rotated.refreshToken);
          accessToken = rotated.accessToken;
        }
        if (accessToken) await logout(accessToken);
        await clearRefreshToken();
        setAccess(undefined);
        setActor(undefined);
        setDeviceId(undefined);
        setOfflineScope(undefined);
        setChallenge(undefined);
        setStatus('anonymous');
      } catch (cause) {
        if (cause instanceof AuthError && cause.code === 'AUTHENTICATION_FAILED') {
          await clearRefreshToken();
          setAccess(undefined);
          setActor(undefined);
          setDeviceId(undefined);
          setOfflineScope(undefined);
          setChallenge(undefined);
          setStatus('anonymous');
        } else setStatus('service-unavailable');
      }
    })();
    signOutFlight.current = task.finally(() => { signOutFlight.current = undefined; });
    return signOutFlight.current;
  }, [access]);

  return <AuthContext.Provider value={{ status, actor, accessToken: access?.accessToken, deviceId, offlineScope, challenge, requestCode, verifyCode, retrySession, signOut }}>{children}</AuthContext.Provider>;
}

function authenticatedScope(
  actor: Actor,
  deviceId: string,
): OfflineAccessScope | undefined {
  if (actor.accessMode === 'offline_recovery') {
    return actor.recoveryRouteSyncId
      ? {
          actorId: actor.userId,
          deviceId,
          accessMode: 'offline_recovery',
          recoveryRouteSyncId: actor.recoveryRouteSyncId,
        }
      : undefined;
  }
  return actor.memberships.some(
    ({ role, status }) => role === 'delivery_agent' && status === 'active',
  )
    ? { actorId: actor.userId, deviceId, accessMode: 'standard' }
    : undefined;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

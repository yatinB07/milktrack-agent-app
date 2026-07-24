import { useNetInfo } from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/auth/storage';
import { getLeaseFreshness } from '@/offline/clock';
import { refreshRouteSnapshot } from '@/offline/route-refresh';
import { getRouteSnapshot, type RouteSnapshot } from '@/offline/route-store';
import type { VendorRouteScope } from '@/offline/types';
import {
  AgentDataError,
  type AgentDataErrorKind,
  type AgentDataRequest,
} from './api';
import { findTodayRouteStop, projectCachedTodayRoute } from './model';

export type TodayRouteStatus = 'loading' | 'success' | 'error';
export type TodayRouteFreshness = 'fresh' | 'stale' | 'clock_rollback' | 'missing';
export type TodayRouteRequest = AgentDataRequest &
  Readonly<{
    actorId?: string;
    accessMode?: 'standard' | 'offline_recovery';
  }>;

export function useTodayRoute(request: TodayRouteRequest) {
  const db = useSQLiteContext();
  const netInfo = useNetInfo();
  const scopeKey = [
    request.actorId,
    request.vendorId,
    request.accessMode,
  ].join(':');
  const blocked = !request.actorId || request.accessMode === 'offline_recovery';
  const [snapshotState, setSnapshotState] = useState<Readonly<{
    scopeKey: string;
    snapshot: RouteSnapshot | null;
  }>>();
  const [initializedScope, setInitializedScope] = useState<string>();
  const [refreshErrorState, setRefreshErrorState] = useState<Readonly<{
    scopeKey: string;
    error?: AgentDataErrorKind;
  }>>();
  const [refreshingScope, setRefreshingScope] = useState<string | undefined>(undefined);
  const activeScope = useRef<string | undefined>(undefined);
  const refreshGeneration = useRef(0);

  const refreshScope = useCallback(async (
    scope: VendorRouteScope,
    targetScopeKey: string,
    accessToken: string,
    runKey: string,
  ) => {
    setRefreshErrorState({ scopeKey: targetScopeKey });
    setRefreshingScope(targetScopeKey);
    try {
      const refreshed = await refreshRouteSnapshot({
        ...scope,
        db,
        vendorId: request.vendorId,
        accessToken,
      });
      if (activeScope.current !== runKey) return;
      setSnapshotState({ scopeKey: targetScopeKey, snapshot: refreshed.snapshot });
    } catch (error) {
      if (activeScope.current !== runKey) return;
      setRefreshErrorState({ scopeKey: targetScopeKey, error: kind(error) });
    } finally {
      if (activeScope.current === runKey) setRefreshingScope(undefined);
    }
  }, [db, request.vendorId]);

  useEffect(() => {
    let active = true;
    const runKey = `${scopeKey}:${++refreshGeneration.current}`;
    activeScope.current = runKey;

    if (blocked) {
      return () => {
        active = false;
        if (activeScope.current === runKey) activeScope.current = undefined;
      };
    }

    void (async () => {
      try {
        const scope = {
          actorId: request.actorId!,
          vendorId: request.vendorId,
          deviceId: await getOrCreateDeviceId(),
        };
        const local = await getRouteSnapshot(db, scope);
        if (!active) return;
        setSnapshotState({ scopeKey, snapshot: local });
        setInitializedScope(scopeKey);
        if (netInfo.isConnected === true) {
          await refreshScope(scope, scopeKey, request.accessToken, runKey);
        }
      } catch (error) {
        if (!active) return;
        setRefreshErrorState({ scopeKey, error: kind(error) });
        setInitializedScope(scopeKey);
      }
    })();

    return () => {
      active = false;
      if (activeScope.current === runKey) activeScope.current = undefined;
    };
  }, [
    db,
    netInfo.isConnected,
    refreshScope,
    blocked,
    request.accessMode,
    request.accessToken,
    request.actorId,
    request.vendorId,
    scopeKey,
  ]);

  const refresh = useCallback(async () => {
    if (
      !request.actorId
      || request.accessMode === 'offline_recovery'
      || netInfo.isConnected !== true
    ) {
      setRefreshErrorState({ scopeKey, error: 'unavailable' });
      return;
    }
    const runKey = `${scopeKey}:${++refreshGeneration.current}`;
    activeScope.current = runKey;
    await refreshScope({
      actorId: request.actorId,
      vendorId: request.vendorId,
      deviceId: await getOrCreateDeviceId(),
    }, scopeKey, request.accessToken, runKey);
  }, [
    netInfo.isConnected,
    refreshScope,
    request.accessMode,
    request.accessToken,
    request.actorId,
    request.vendorId,
    scopeKey,
  ]);

  const snapshot = snapshotState?.scopeKey === scopeKey
    ? snapshotState.snapshot
    : null;
  const initialized = blocked || initializedScope === scopeKey;
  const refreshError = refreshErrorState?.scopeKey === scopeKey
    ? refreshErrorState.error
    : undefined;
  const isRefreshing = refreshingScope === scopeKey;
  const projected = useMemo(() => {
    if (!snapshot) return {};
    try {
      return {
        model: projectCachedTodayRoute(snapshot.route, snapshot.serviceDate),
      };
    } catch {
      return { invalid: true };
    }
  }, [snapshot]);
  const model = projected.model;
  const freshness: TodayRouteFreshness = snapshot
    ? getLeaseFreshness(snapshot.lease)
    : 'missing';
  const status: TodayRouteStatus = !initialized
    ? 'loading'
    : model
      ? 'success'
      : 'error';
  const errorKind = refreshError ?? (projected.invalid ? 'unavailable' : undefined);

  return {
    status,
    loading: status === 'loading',
    errorKind,
    serviceDate: snapshot?.serviceDate,
    model,
    freshness,
    refresh,
    isRefreshing,
    lastRefreshedAt: snapshot?.lease.savedAtWallMs,
    findStop: useCallback((routeStopId: string) => model
      ? findTodayRouteStop(model, routeStopId)
      : undefined, [model]),
  };
}

function kind(error: unknown): AgentDataErrorKind {
  return error instanceof AgentDataError ? error.kind : 'unavailable';
}

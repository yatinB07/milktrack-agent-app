import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { OfflineAccessScope } from '@/offline/types';

const DEVICE_KEY = 'milktrack.agent.device';
const REFRESH_KEY = 'milktrack.agent.refresh';
const ACTIVE_VENDOR_KEY = 'milktrack.agent.vendor';
const OFFLINE_SCOPE_KEY = 'milktrack.agent.offline-scope';
let webDeviceId: string | undefined;

function newDeviceId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === 'web') return webDeviceId ??= newDeviceId();
  const stored = await SecureStore.getItemAsync(DEVICE_KEY);
  if (stored) return stored;
  const created = newDeviceId();
  await SecureStore.setItemAsync(DEVICE_KEY, created);
  return created;
}

export async function loadRefreshToken(): Promise<string | null> {
  return Platform.OS === 'web' ? null : SecureStore.getItemAsync(REFRESH_KEY);
}

export async function saveRefreshToken(value: string): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(REFRESH_KEY, value);
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function loadActiveVendorId(): Promise<string | null> {
  return Platform.OS === 'web' ? null : SecureStore.getItemAsync(ACTIVE_VENDOR_KEY);
}

export async function saveActiveVendorId(vendorId: string): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(ACTIVE_VENDOR_KEY, vendorId);
}

export async function clearActiveVendorId(): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(ACTIVE_VENDOR_KEY);
}

export async function loadLastAuthenticatedOfflineScope(): Promise<OfflineAccessScope | null> {
  if (Platform.OS === 'web') return null;
  const stored = await SecureStore.getItemAsync(OFFLINE_SCOPE_KEY);
  if (!stored) return null;
  try {
    return parseOfflineScope(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveLastAuthenticatedOfflineScope(
  scope: OfflineAccessScope,
): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(OFFLINE_SCOPE_KEY, JSON.stringify(scope));
  }
}

function parseOfflineScope(value: unknown): OfflineAccessScope | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  if (
    typeof scope.actorId !== 'string' ||
    scope.actorId.length === 0 ||
    typeof scope.deviceId !== 'string' ||
    scope.deviceId.length === 0
  ) {
    return null;
  }
  if (
    scope.accessMode === 'standard' &&
    Object.keys(scope).length === 3
  ) {
    return {
      actorId: scope.actorId,
      deviceId: scope.deviceId,
      accessMode: 'standard',
    };
  }
  if (
    scope.accessMode === 'offline_recovery' &&
    typeof scope.recoveryRouteSyncId === 'string' &&
    scope.recoveryRouteSyncId.length > 0 &&
    Object.keys(scope).length === 4
  ) {
    return {
      actorId: scope.actorId,
      deviceId: scope.deviceId,
      accessMode: 'offline_recovery',
      recoveryRouteSyncId: scope.recoveryRouteSyncId,
    };
  }
  return null;
}

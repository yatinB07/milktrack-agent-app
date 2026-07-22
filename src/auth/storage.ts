import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_KEY = 'milktrack.agent.device';
const REFRESH_KEY = 'milktrack.agent.refresh';
const ACTIVE_VENDOR_KEY = 'milktrack.agent.vendor';
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

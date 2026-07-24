import * as SecureStore from 'expo-secure-store';
import {
  clearActiveVendorId,
  clearRefreshToken,
  getOrCreateDeviceId,
  loadActiveVendorId,
  loadLastAuthenticatedOfflineScope,
  loadRefreshToken,
  saveActiveVendorId,
  saveLastAuthenticatedOfflineScope,
  saveRefreshToken,
} from '../storage';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('reuses a device identifier from encrypted storage', async () => {
  getItem.mockResolvedValueOnce('agent-device');
  await expect(getOrCreateDeviceId()).resolves.toBe('agent-device');
  expect(setItem).not.toHaveBeenCalled();
});

it('stores only the refresh credential and never the access credential', async () => {
  await saveRefreshToken('refresh-value');
  expect(setItem).toHaveBeenCalledWith('milktrack.agent.refresh', 'refresh-value');
  expect(setItem).not.toHaveBeenCalledWith(expect.anything(), 'access-value');
});

it('loads and clears the refresh credential', async () => {
  getItem.mockResolvedValueOnce('refresh-value');
  await expect(loadRefreshToken()).resolves.toBe('refresh-value');
  await clearRefreshToken();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('milktrack.agent.refresh');
});

it('persists only the non-secret active vendor identifier', async () => {
  getItem.mockResolvedValueOnce('vendor-a');
  await expect(loadActiveVendorId()).resolves.toBe('vendor-a');
  await saveActiveVendorId('vendor-b');
  await clearActiveVendorId();

  expect(getItem).toHaveBeenCalledWith('milktrack.agent.vendor');
  expect(setItem).toHaveBeenCalledWith('milktrack.agent.vendor', 'vendor-b');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('milktrack.agent.vendor');
});

it('persists and validates only the non-secret last authenticated offline scope', async () => {
  const recoveryScope = {
    actorId: 'actor-1',
    deviceId: 'device-1',
    accessMode: 'offline_recovery' as const,
    recoveryRouteSyncId: 'route-sync-1',
  };
  await saveLastAuthenticatedOfflineScope(recoveryScope);
  expect(setItem).toHaveBeenCalledWith(
    'milktrack.agent.offline-scope',
    JSON.stringify(recoveryScope),
  );
  expect(setItem.mock.calls[0]![1]).not.toContain('accessToken');
  expect(setItem.mock.calls[0]![1]).not.toContain('refreshToken');

  getItem.mockResolvedValueOnce(JSON.stringify(recoveryScope));
  await expect(loadLastAuthenticatedOfflineScope()).resolves.toEqual(
    recoveryScope,
  );
  getItem.mockResolvedValueOnce(
    JSON.stringify({
      ...recoveryScope,
      accessMode: 'standard',
      recoveryRouteSyncId: 'must-not-survive',
    }),
  );
  await expect(loadLastAuthenticatedOfflineScope()).resolves.toBeNull();
  getItem.mockResolvedValueOnce('{malformed');
  await expect(loadLastAuthenticatedOfflineScope()).resolves.toBeNull();
});

it('does not clear the last authenticated offline scope with session secrets', async () => {
  await clearRefreshToken();

  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    'milktrack.agent.refresh',
  );
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith(
    'milktrack.agent.offline-scope',
  );
});

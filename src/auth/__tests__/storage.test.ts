import * as SecureStore from 'expo-secure-store';
import { clearRefreshToken, getOrCreateDeviceId, loadRefreshToken, saveRefreshToken } from '../storage';

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

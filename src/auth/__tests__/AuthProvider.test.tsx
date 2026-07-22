import { fireEvent, render } from '@testing-library/react-native';
import { Button, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '../AuthProvider';
import * as authApi from '../api';
import * as storage from '../storage';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, getCurrentActor: jest.fn(), logout: jest.fn(), refreshSession: jest.fn(), requestOtp: jest.fn(), verifyOtp: jest.fn() };
});
jest.mock('../storage');

const challenge = { accepted: true, challengeToken: 'challenge', expiresAt: '2026-07-19T12:05:00.000Z' } as const;
const session = { accessToken: 'access', accessExpiresAt: '2099-07-19T12:15:00.000Z', refreshToken: 'refresh', refreshExpiresAt: '2099-08-19T12:00:00.000Z' };
const actor = { userId: 'user', displayName: 'Agent A', platformRoles: [], memberships: [{ id: 'membership', vendorId: 'vendor', vendorName: 'Vendor A', role: 'delivery_agent' as const, status: 'active' as const }], sessionId: 'session' };

function Probe() {
  const auth = useAuth();
  return <View><Text>{auth.status}</Text><Text>{auth.challenge?.phone}</Text><Text>{auth.actor?.displayName}</Text><Text>{auth.accessToken}</Text><Button title="request" onPress={() => void auth.requestCode('9876543210')} /><Button title="verify" onPress={() => void auth.verifyCode('123456')} /><Button title="retry" onPress={() => void auth.retrySession()} /><Button title="logout" onPress={() => void auth.signOut()} /></View>;
}

function renderAuth() {
  return render(<AuthProvider><Probe /></AuthProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(storage.loadRefreshToken).mockResolvedValue(null);
  jest.mocked(storage.getOrCreateDeviceId).mockResolvedValue('agent-device');
});

it('requests and verifies OTP without putting the challenge in route state', async () => {
  jest.mocked(authApi.requestOtp).mockResolvedValue(challenge);
  jest.mocked(authApi.verifyOtp).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockResolvedValue(actor);
  const view = await renderAuth();
  await view.findByText('anonymous');

  await fireEvent.press(view.getByRole('button', { name: 'request' }));
  await view.findByText('9876543210');
  expect(authApi.requestOtp).toHaveBeenCalledWith('+919876543210');

  await fireEvent.press(view.getByRole('button', { name: 'verify' }));
  await view.findByText('authenticated');
  expect(authApi.verifyOtp).toHaveBeenCalledWith('challenge', '123456', 'agent-device');
  expect(storage.saveRefreshToken).toHaveBeenCalledWith('refresh');
  expect(view.getByText('Agent A')).toBeTruthy();
  expect(view.getByText('access')).toBeTruthy();
});

it('restores a rotated session and marks an unassigned user unavailable', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValue('stored-refresh');
  jest.mocked(authApi.refreshSession).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockResolvedValue({ ...actor, memberships: [] });
  const view = await renderAuth();

  await view.findByText('access-unavailable');
  expect(authApi.refreshSession).toHaveBeenCalledWith('stored-refresh', 'agent-device');
  expect(storage.saveRefreshToken).toHaveBeenCalledWith('refresh');
});

it('marks an authenticated wrong-role account as permission denied', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValue('stored-refresh');
  jest.mocked(authApi.refreshSession).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockResolvedValue({
    ...actor,
    memberships: [{ ...actor.memberships[0]!, role: 'customer' }],
  });
  const view = await renderAuth();
  await view.findByText('permission-denied');
});

it('expires a session when actor lookup rejects its credential', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValue('stored-refresh');
  jest.mocked(authApi.refreshSession).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockRejectedValue(
    new authApi.AuthError('Authentication failed', undefined, 'AUTHENTICATION_FAILED'),
  );
  const view = await renderAuth();

  await view.findByText('anonymous');
  expect(storage.clearRefreshToken).toHaveBeenCalled();
});

it('serializes concurrent refresh attempts for a rotating token', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValue('stored-refresh');
  let resolveRefresh!: (value: typeof session) => void;
  jest.mocked(authApi.refreshSession).mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve; }));
  jest.mocked(authApi.getCurrentActor).mockResolvedValue(actor);
  const view = await renderAuth();

  await view.findByText('loading');
  await fireEvent.press(view.getByRole('button', { name: 'retry' }));
  await fireEvent.press(view.getByRole('button', { name: 'retry' }));
  expect(authApi.refreshSession).toHaveBeenCalledTimes(1);
  resolveRefresh(session);
  await view.findByText('authenticated');
});

it('preserves a valid OTP session when actor lookup is temporarily unavailable', async () => {
  jest.mocked(authApi.requestOtp).mockResolvedValue(challenge);
  jest.mocked(authApi.verifyOtp).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockRejectedValue(new Error('offline'));
  const view = await renderAuth();
  await view.findByText('anonymous');
  await fireEvent.press(view.getByRole('button', { name: 'request' }));
  await view.findByText('9876543210');
  await fireEvent.press(view.getByRole('button', { name: 'verify' }));

  await view.findByText('service-unavailable');
  expect(storage.saveRefreshToken).toHaveBeenCalledWith('refresh');
});

it('expires an invalid stored session instead of retrying it forever', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValue('stored-refresh');
  jest.mocked(authApi.refreshSession).mockRejectedValue(new authApi.AuthError('Authentication failed', undefined, 'AUTHENTICATION_FAILED'));
  const view = await renderAuth();

  await view.findByText('anonymous');
  expect(storage.clearRefreshToken).toHaveBeenCalled();
});

it('keeps the session retryable when remote logout cannot revoke it', async () => {
  jest.mocked(authApi.requestOtp).mockResolvedValue(challenge);
  jest.mocked(authApi.verifyOtp).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockResolvedValue(actor);
  jest.mocked(authApi.logout).mockRejectedValue(new Error('offline'));
  const view = await renderAuth();
  await view.findByText('anonymous');
  await fireEvent.press(view.getByRole('button', { name: 'request' }));
  await view.findByText('9876543210');
  await fireEvent.press(view.getByRole('button', { name: 'verify' }));
  await view.findByText('authenticated');

  await fireEvent.press(view.getByRole('button', { name: 'logout' }));
  await view.findByText('service-unavailable');
  expect(storage.clearRefreshToken).not.toHaveBeenCalled();
});

it('rotates an expired mobile credential before revoking the current session', async () => {
  jest.mocked(storage.loadRefreshToken).mockResolvedValueOnce(null).mockResolvedValueOnce('stored-refresh');
  jest.mocked(authApi.requestOtp).mockResolvedValue(challenge);
  jest.mocked(authApi.verifyOtp).mockResolvedValue(session);
  jest.mocked(authApi.getCurrentActor).mockResolvedValue(actor);
  jest.mocked(authApi.refreshSession).mockResolvedValue({ ...session, accessToken: 'logout-access', refreshToken: 'logout-refresh' });
  jest.mocked(authApi.logout).mockResolvedValue();
  const view = await renderAuth();
  await view.findByText('anonymous');
  await fireEvent.press(view.getByRole('button', { name: 'request' }));
  await view.findByText('9876543210');
  await fireEvent.press(view.getByRole('button', { name: 'verify' }));
  await view.findByText('authenticated');

  await fireEvent.press(view.getByRole('button', { name: 'logout' }));
  await view.findByText('anonymous');
  expect(authApi.refreshSession).toHaveBeenCalledWith('stored-refresh', 'agent-device');
  expect(authApi.logout).toHaveBeenCalledWith('logout-access');
  expect(storage.clearRefreshToken).toHaveBeenCalled();
});

import { render, screen } from '@testing-library/react-native';
import { Redirect } from 'expo-router';
import Index from '../../../app/index';

let mockStatus = 'anonymous';

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('expo-router', () => ({ Redirect: jest.fn(() => null) }));

beforeEach(() => jest.clearAllMocks());

it.each([
  ['anonymous', '/(auth)/phone'],
  ['authenticated', '/(tabs)'],
  ['access-unavailable', '/(tabs)'],
  ['service-unavailable', '/(tabs)'],
])('routes %s session state to %s', async (status, destination) => {
  mockStatus = status;
  await render(<Index />);
  expect(Redirect).toHaveBeenCalledWith({ href: destination }, undefined);
});

it('renders a non-interactive restoration state while credentials load', async () => {
  mockStatus = 'loading';
  await render(<Index />);
  expect(screen.getByText('Restoring session')).toBeTruthy();
});

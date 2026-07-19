import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { AccountScreen } from '../AccountScreen';
import { RouteScreen } from '../RouteScreen';
import { SyncScreen } from '../SyncScreen';
import { AppProviders } from '@/providers/AppProviders';

let mockAuth = {
  status: 'authenticated',
  actor: { displayName: 'Agent A', memberships: [{ vendorName: 'Vendor A', role: 'delivery_agent', status: 'active' }] },
  retrySession: jest.fn(),
  signOut: jest.fn(),
};

jest.mock('@/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuth,
}));

jest.mock('@/api/health', () => ({ getHealth: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: null }) }));

const renderScreen = (Component: ComponentType) => render(<AppProviders><Component /></AppProviders>);

it.each([
  [RouteScreen, "Today's route", 'Check for route'],
  [SyncScreen, 'Sync', 'Check connection'],
  [AccountScreen, 'Account', 'Sign out'],
])('renders a field shell', async (Component, heading, action) => {
  await renderScreen(Component);
  expect(screen.getByText(heading)).toBeTruthy();
  expect(screen.getByRole('button', { name: action })).toBeTruthy();
});

it('displays authenticated agent and vendor identity', async () => {
  await renderScreen(AccountScreen);
  expect(screen.getByText('Agent A')).toBeTruthy();
  expect(screen.getByText('Vendor A')).toBeTruthy();
});

it('shows an explicit no-assignment state with retry', async () => {
  mockAuth = { ...mockAuth, status: 'access-unavailable', actor: { displayName: 'Agent A', memberships: [] } };
  await renderScreen(RouteScreen);
  expect(screen.getByText('No delivery assignment')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

it('shows a wrong-role permission state', async () => {
  mockAuth = { ...mockAuth, status: 'permission-denied' };
  await renderScreen(RouteScreen);
  expect(screen.getByText('Delivery access restricted')).toBeTruthy();
});

it('shows service failure instead of misreporting an assignment problem', async () => {
  mockAuth = { ...mockAuth, status: 'service-unavailable' };
  await renderScreen(RouteScreen);
  expect(screen.getByText('MilkTrack is unavailable')).toBeTruthy();
  await renderScreen(SyncScreen);
  expect(screen.getByText('Synchronization unavailable')).toBeTruthy();
  expect(screen.queryByText('All changes synchronized')).toBeNull();
});

it('shows empty route and synchronized states without inventing an offline queue', async () => {
  mockAuth = { ...mockAuth, status: 'authenticated', actor: { displayName: 'Agent A', memberships: [{ vendorName: 'Vendor A', role: 'delivery_agent', status: 'active' }] } };
  await renderScreen(RouteScreen);
  expect(screen.getByText('No route assigned today')).toBeTruthy();
  await renderScreen(SyncScreen);
  expect(screen.getByText('All changes synchronized')).toBeTruthy();
});

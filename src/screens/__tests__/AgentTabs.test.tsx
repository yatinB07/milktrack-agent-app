import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { AccountScreen } from '../AccountScreen';
import { RouteScreen } from '../RouteScreen';
import { SyncScreen } from '../SyncScreen';
import { AppProviders } from '@/providers/AppProviders';

jest.mock('@/api/health', () => ({ getHealth: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: null }) }));

const renderScreen = (Component: ComponentType) => render(<AppProviders><Component /></AppProviders>);

it.each([
  [RouteScreen, "Today's route", 'Check for route'],
  [SyncScreen, 'Sync', 'Check connection'],
  [AccountScreen, 'Account', 'Sign in'],
])('renders a field shell', async (Component, heading, action) => {
  await renderScreen(Component);
  expect(screen.getByText(heading)).toBeTruthy();
  expect(screen.getByRole('button', { name: action })).toBeTruthy();
});

it.each([RouteScreen, SyncScreen])('states that no durable action exists', async (Component) => {
  await renderScreen(Component);
  expect(screen.getByText('No offline actions are stored in this foundation build')).toBeTruthy();
});

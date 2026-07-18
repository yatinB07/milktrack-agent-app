import { render, screen } from '@testing-library/react-native';
import { AccountScreen } from '../AccountScreen';
import { RouteScreen } from '../RouteScreen';
import { SyncScreen } from '../SyncScreen';

it.each([
  [RouteScreen, "Today's route", 'Check for route'],
  [SyncScreen, 'Sync', 'Check connection'],
  [AccountScreen, 'Account', 'Sign in'],
])('renders a field shell', async (Component, heading, action) => {
  await render(<Component />);
  expect(screen.getByText(heading)).toBeTruthy();
  expect(screen.getByRole('button', { name: action })).toBeTruthy();
});

it.each([RouteScreen, SyncScreen])('states that no durable action exists', async (Component) => {
  await render(<Component />);
  expect(screen.getByText('No offline actions are stored in this foundation build')).toBeTruthy();
});

import { render, screen } from '@testing-library/react-native';
import { Redirect, Tabs } from 'expo-router';
import TabLayout from '../../../app/(tabs)/_layout';

let mockAuthStatus = 'authenticated';
let mockWorkspaceStatus = 'ready';

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ status: mockAuthStatus }) }));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({ useAgentWorkspace: () => ({ status: mockWorkspaceStatus, activeVendor: { vendorId: 'vendor-a', vendorName: 'Private Vendor' } }) }));
jest.mock('expo-router', () => {
  const MockTabs = Object.assign(jest.fn(() => null), { Screen: jest.fn(() => null) });
  return { Redirect: jest.fn(() => null), Tabs: MockTabs };
});
jest.mock('@react-native-vector-icons/material-design-icons', () => () => null, { virtual: true });

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStatus = 'authenticated';
  mockWorkspaceStatus = 'ready';
});

it('redirects a multi-vendor agent without a selection before rendering tabs', async () => {
  mockWorkspaceStatus = 'selection-required';
  await render(<TabLayout />);
  expect(Redirect).toHaveBeenCalledWith({ href: '/agent-workspace' }, undefined);
  expect(Tabs).not.toHaveBeenCalled();
});

it('shows a non-identifying state while stored workspace restoration is pending', async () => {
  mockWorkspaceStatus = 'loading';
  await render(<TabLayout />);
  expect(screen.getByText('Loading workspace')).toBeTruthy();
  expect(screen.queryByText('Private Vendor')).toBeNull();
  expect(Tabs).not.toHaveBeenCalled();
});

it('renders tabs only after a stored workspace is restored', async () => {
  await render(<TabLayout />);
  expect(Tabs).toHaveBeenCalled();
  expect(Redirect).not.toHaveBeenCalled();
});

it('assigns a visible label and vector icon to every agent tab', async () => {
  await render(<TabLayout />);

  const options = (Tabs as unknown as jest.Mock).mock.calls[0]?.[0]?.screenOptions({ route: { name: 'sync' } });
  expect(options.tabBarShowLabel).toBe(true);
  expect(options.tabBarIcon).toBeDefined();
});

import { render, screen } from '@testing-library/react-native';
import { Redirect } from 'expo-router';
import Index from '../../../app/index';

let mockStatus = 'anonymous';
let mockWorkspaceStatus = 'ready';

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({ useAgentWorkspace: () => ({ status: mockWorkspaceStatus, activeVendor: { vendorId: 'vendor-a', vendorName: 'Private Vendor' } }) }));
jest.mock('expo-router', () => ({ Redirect: jest.fn(() => null) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkspaceStatus = 'ready';
});

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

it('routes an authenticated multi-vendor agent without a selection to workspace choice', async () => {
  mockStatus = 'authenticated';
  mockWorkspaceStatus = 'selection-required';
  await render(<Index />);
  expect(Redirect).toHaveBeenCalledWith({ href: '/agent-workspace' }, undefined);
});

it('routes a restored valid workspace directly to tabs', async () => {
  mockStatus = 'authenticated';
  mockWorkspaceStatus = 'ready';
  await render(<Index />);
  expect(Redirect).toHaveBeenCalledWith({ href: '/(tabs)' }, undefined);
});

it('shows no workspace identity while a stored selection is loading', async () => {
  mockStatus = 'authenticated';
  mockWorkspaceStatus = 'loading';
  await render(<Index />);
  expect(screen.getByText('Loading workspace')).toBeTruthy();
  expect(screen.queryByText('Private Vendor')).toBeNull();
});

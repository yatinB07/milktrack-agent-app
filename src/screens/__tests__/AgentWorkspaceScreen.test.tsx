import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AgentWorkspaceScreen } from '../AgentWorkspaceScreen';

jest.mock('@/agent/AgentWorkspaceProvider');
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const selectVendor = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  selectVendor.mockResolvedValue(undefined);
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'selection-required',
    vendors: [
      { vendorId: 'vendor-a', vendorName: 'Vendor A' },
      { vendorId: 'vendor-b', vendorName: 'Vendor B' },
    ],
    selectVendor,
    clearVendor: jest.fn(),
  });
});

it('selects an authorized vendor and returns to the agent tabs', async () => {
  await render(<AgentWorkspaceScreen />);

  expect(screen.getByText('Choose workspace')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Vendor B' }));

  await waitFor(() => expect(selectVendor).toHaveBeenCalledWith('vendor-b'));
  expect(router.replace).toHaveBeenCalledWith('/(tabs)');
});

it('hides vendor choices while workspace state is loading', async () => {
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'loading',
    vendors: [],
    selectVendor,
    clearVendor: jest.fn(),
  });

  await render(<AgentWorkspaceScreen />);

  expect(screen.getByText('Loading workspaces')).toBeTruthy();
  expect(screen.queryByText('Choose workspace')).toBeNull();
});

it('shows an explicit unavailable state without an empty selector', async () => {
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'access-unavailable',
    vendors: [],
    selectVendor,
    clearVendor: jest.fn(),
  });

  await render(<AgentWorkspaceScreen />);

  expect(screen.getByText('No delivery workspace')).toBeTruthy();
  expect(screen.queryByText('Choose workspace')).toBeNull();
});

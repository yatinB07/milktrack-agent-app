import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AgentWorkspaceScreen } from '../AgentWorkspaceScreen';

jest.mock('expo-sqlite', () => ({ useSQLiteContext: jest.fn() }));
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

  expect(screen.getByRole('header', { name: 'Choose workspace' })).toBeTruthy();
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

it('stays on the selector with an alert and allows retry after selection fails', async () => {
  selectVendor.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined);
  await render(<AgentWorkspaceScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Vendor B' }));

  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByText('Workspace selection failed. Try again.')).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Vendor B' }));
  await waitFor(() => expect(selectVendor).toHaveBeenCalledTimes(2));
  expect(router.replace).toHaveBeenCalledWith('/(tabs)');
});

it('uses the approved workspace-selection guidance', async () => {
  await render(<AgentWorkspaceScreen />);

  expect(screen.getByText('Choose the vendor workspace for today’s assigned route.')).toBeTruthy();
});

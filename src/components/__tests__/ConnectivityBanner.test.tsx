import { fireEvent, render, screen } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { ConnectivityBanner } from '../ConnectivityBanner';

jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));

const netInfo = useNetInfo as jest.Mock;
const query = useQuery as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  netInfo.mockReturnValue({ isConnected: true });
  query.mockReturnValue({ isPending: true, refetch: jest.fn() });
});

it.each([
  [false, { isPending: true }, 'Connection status: Offline'],
  [null, { isPending: true }, 'Connection status: Checking'],
  [true, { isPending: true }, 'Connection status: Checking'],
  [true, { isPending: false, data: { status: 'ok' } }, 'Connection status: Online'],
  [true, { isPending: false, isError: true }, 'MilkTrack service is unavailable. Try again.'],
])('renders the production connectivity state', async (isConnected, state, text) => {
  netInfo.mockReturnValue({ isConnected });
  query.mockReturnValue({ refetch: jest.fn(), ...state });
  await render(<ConnectivityBanner />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(query).toHaveBeenCalledWith(expect.objectContaining({ enabled: isConnected === true }));
});

it('activates retry after a service failure', async () => {
  const refetch = jest.fn();
  query.mockReturnValue({ isPending: false, isError: true, refetch });
  await render(<ConnectivityBanner />);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry connection' }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

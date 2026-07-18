import { render, screen } from '@testing-library/react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { getHealth } from '@/api/health';
import { AppProviders } from '@/providers/AppProviders';
import { ConnectivityBanner } from '../ConnectivityBanner';

jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: jest.fn() }));
jest.mock('@/api/health', () => ({ getHealth: jest.fn() }));

it('offers retry when the connected service is unavailable', async () => {
  (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true });
  (getHealth as jest.Mock).mockRejectedValue(new Error('unavailable'));
  await render(<AppProviders><ConnectivityBanner /></AppProviders>);
  expect(await screen.findByText('MilkTrack service is unavailable. Try again.', {}, { timeout: 4000 })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeTruthy();
});

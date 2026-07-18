import { fireEvent, render, screen } from '@testing-library/react-native';
import OtpRoute from '../../../app/(auth)/otp';
import PhoneRoute from '../../../app/(auth)/phone';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ phone: '9876543219' }),
}));

beforeEach(() => jest.clearAllMocks());

it('carries the submitted phone to OTP verification', async () => {
  await render(<PhoneRoute />);
  await fireEvent.changeText(screen.getByLabelText('Phone number'), '9876543219');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/otp', params: { phone: '9876543219' } });
});

it('shows the submitted phone masked on OTP verification', async () => {
  await render(<OtpRoute />);
  expect(screen.getByText('Enter the code for +91 ••••••3219.')).toBeTruthy();
});

it('does not create a session from presentation-only OTP validation', async () => {
  await render(<OtpRoute />);
  await fireEvent.changeText(screen.getByLabelText('Six-digit code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(mockReplace).not.toHaveBeenCalled();
});

it('does not announce placeholder Help as an interactive link', async () => {
  await render(<PhoneRoute />);
  expect(screen.queryByRole('link', { name: 'Help' })).toBeNull();
});

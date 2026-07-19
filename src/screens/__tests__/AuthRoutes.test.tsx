import { fireEvent, render, screen } from '@testing-library/react-native';
import OtpRoute from '../../../app/(auth)/otp';
import PhoneRoute from '../../../app/(auth)/phone';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRequestCode = jest.fn();
const mockVerifyCode = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ challenge: { phone: '9876543219' }, requestCode: mockRequestCode, verifyCode: mockVerifyCode }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ phone: '9876543219' }),
}));

beforeEach(() => jest.clearAllMocks());

it('requests a challenge before opening OTP verification', async () => {
  await render(<PhoneRoute />);
  await fireEvent.changeText(screen.getByLabelText('Phone number'), '9876543219');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRequestCode).toHaveBeenCalledWith('9876543219');
  expect(mockPush).toHaveBeenCalledWith('/(auth)/otp');
});

it('shows the submitted phone masked on OTP verification', async () => {
  await render(<OtpRoute />);
  expect(screen.getByText('Enter the code for +91 ••••••3219.')).toBeTruthy();
});

it('verifies OTP and opens the authenticated route', async () => {
  await render(<OtpRoute />);
  await fireEvent.changeText(screen.getByLabelText('Six-digit code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(mockVerifyCode).toHaveBeenCalledWith('123456');
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
});

it('does not announce placeholder Help as an interactive link', async () => {
  await render(<PhoneRoute />);
  expect(screen.queryByRole('link', { name: 'Help' })).toBeNull();
});

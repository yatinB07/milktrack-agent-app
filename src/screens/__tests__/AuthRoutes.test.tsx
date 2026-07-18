import { fireEvent, render, screen } from '@testing-library/react-native';
import OtpRoute from '../../../app/(auth)/otp';
import PhoneRoute from '../../../app/(auth)/phone';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
  useLocalSearchParams: () => ({ phone: '9876543219' }),
}));

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

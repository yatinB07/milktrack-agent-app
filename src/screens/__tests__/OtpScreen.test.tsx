import { fireEvent, render, screen } from '@testing-library/react-native';
import { OtpScreen } from '../OtpScreen';
import { AuthError } from '@/auth/api';

it('preserves invalid digits and verifies a six-digit code', async () => {
  const onVerify = jest.fn();
  await render(<OtpScreen onVerify={onVerify} />);
  const field = screen.getByLabelText('Six-digit code');
  await fireEvent.changeText(field, '123');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(field).toHaveProp('value', '123');
  expect(screen.getByText('Enter the 6-digit code')).toBeTruthy();
  await fireEvent.changeText(field, '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(onVerify).toHaveBeenCalledWith('123456');
});

it('prevents overlapping resends and exposes backend retry timing', async () => {
  const onResend = jest.fn().mockRejectedValue(new AuthError('Try again later', 30, 'RATE_LIMITED'));
  await render(<OtpScreen onVerify={jest.fn()} onResend={onResend} />);
  const resend = screen.getByRole('button', { name: 'Resend code' });

  await fireEvent.press(resend);
  expect(onResend).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Try again in 30 seconds')).toBeTruthy();
  expect(resend).toHaveProp('accessibilityState', { disabled: true });
});

it('uses security-safe access copy for an authentication denial', async () => {
  const onVerify = jest.fn().mockRejectedValue(
    new AuthError('Authentication failed', undefined, 'AUTHENTICATION_FAILED'),
  );
  await render(<OtpScreen onVerify={onVerify} />);
  await fireEvent.changeText(screen.getByLabelText('Six-digit code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

  expect(screen.getByText('The code is invalid or expired, or account access is unavailable.')).toBeTruthy();
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { OtpScreen } from '../OtpScreen';

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

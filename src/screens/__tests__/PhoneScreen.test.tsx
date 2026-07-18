import { fireEvent, render, screen } from '@testing-library/react-native';
import { PhoneScreen } from '../PhoneScreen';

it('keeps invalid input and submits a valid agent phone', async () => {
  const onContinue = jest.fn();
  await render(<PhoneScreen onContinue={onContinue} />);
  const field = screen.getByLabelText('Phone number');
  expect(field).toHaveProp('keyboardType', 'phone-pad');
  await fireEvent.changeText(field, '123');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(field).toHaveProp('value', '123');
  expect(screen.getByText('Enter a 10-digit phone number')).toBeTruthy();
  await fireEvent.changeText(field, '9876543210');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onContinue).toHaveBeenCalledWith('9876543210');
});

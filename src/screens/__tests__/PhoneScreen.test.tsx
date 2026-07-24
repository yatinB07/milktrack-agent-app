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

it('lets the same phone request recovery for a selected saved route', async () => {
  const onRecoveryContinue = jest.fn();
  await render(
    <PhoneScreen
      onContinue={jest.fn()}
      recoveryRouteSyncIds={['route-sync-1', 'route-sync-2']}
      onRecoveryContinue={onRecoveryContinue}
    />,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Phone number'),
    '9876543210',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Recover saved deliveries 2' }),
  );

  expect(onRecoveryContinue).toHaveBeenCalledWith(
    '9876543210',
    'route-sync-2',
  );
});

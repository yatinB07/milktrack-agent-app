import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';
import { Button, getButtonPressedStyle } from '../Button';
import { Field } from '../Field';
import { StateMessage } from '../StateMessage';

it('renders a secondary button with an accessible disabled state', async () => {
  await render(<Button label="Retry" variant="secondary" disabled onPress={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'Retry' }).props.accessibilityState.disabled).toBe(true);
});

it('announces field errors without removing helper context', async () => {
  await render(
    <Field
      label="Phone number"
      helper="Use your registered number"
      error="Enter 10 digits"
    />,
  );

  expect(screen.getByText('Enter 10 digits')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(screen.getByText('Use your registered number')).toBeTruthy();
});

it('presents an unavailable state with its semantic treatment', async () => {
  await render(<StateMessage kind="unavailable" title="Route unavailable" body="Try again later." />);

  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('Route unavailable')).toBeTruthy();
});

it('keeps an alert message and its recovery action separately accessible', async () => {
  await render(<StateMessage kind="failure" title="Route unavailable" body="Try again later." actionLabel="Retry" onAction={jest.fn()} />);

  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' }).parent?.props.accessibilityRole).not.toBe('alert');
});

it.each([
  ['secondary', colors.success.background],
  ['destructive', '#912018'],
] as const)('uses a readable %s pressed treatment', (variant, backgroundColor) => {
  expect(StyleSheet.flatten(getButtonPressedStyle(variant))).toMatchObject({ backgroundColor });
});

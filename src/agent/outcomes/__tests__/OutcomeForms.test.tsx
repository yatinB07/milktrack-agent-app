import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DeliveredOutcomeForm } from '../DeliveredOutcomeForm';
import { MissedOutcomeForm } from '../MissedOutcomeForm';
import { SkipOutcomeForm } from '../SkipOutcomeForm';

const mockCaptureOptionalLocation = jest.fn();
jest.mock('../location', () => ({
  captureOptionalLocation: (...args: unknown[]) =>
    mockCaptureOptionalLocation(...args),
}));

const common = {
  serviceDate: '2026-07-23',
  occurredAt: '2026-07-23T06:30:00.000Z',
  rows: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      version: 2,
      plannedQuantity: '1.250',
      productName: 'Milk',
      unitName: 'Litre',
    },
  ],
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockCaptureOptionalLocation.mockResolvedValue(undefined);
});

it('prefills planned quantity, permits editing, and submits delivered only', async () => {
  const onSubmit = jest.fn();
  await render(<DeliveredOutcomeForm {...common} onSubmit={onSubmit} />);

  const quantity = screen.getByLabelText('Milk quantity in Litre');
  expect(quantity).toHaveProp('value', '1.250');

  await fireEvent.changeText(quantity, '1.5');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Confirm delivered' }),
  );

  expect(onSubmit).toHaveBeenCalledWith({
    serviceDate: common.serviceDate,
    occurredAt: common.occurredAt,
    outcome: 'delivered',
    items: [
      {
        scheduledDeliveryId: common.rows[0].id,
        expectedVersion: 2,
        actualQuantity: '1.5',
      },
    ],
  });
});

it('disables delivered submission and announces invalid quantity', async () => {
  await render(
    <DeliveredOutcomeForm {...common} onSubmit={jest.fn()} submitting />,
  );
  expect(
    screen.getByRole('button', { name: 'Confirm delivered' }),
  ).toHaveProp('accessibilityState', { disabled: true });

  await fireEvent.changeText(
    screen.getByLabelText('Milk quantity in Litre'),
    '0',
  );
  const error = screen.getByText(
    'Enter a positive quantity with up to three decimal places.',
  );
  expect(error).toHaveProp('accessibilityLiveRegion', 'polite');
});

it('shows fixed skip reasons and submits after optional location denial', async () => {
  const onSubmit = jest.fn();
  await render(
    <SkipOutcomeForm
      {...common}
      captureLocationEvidence
      onSubmit={onSubmit}
    />,
  );

  expect(screen.getByRole('button', { name: 'Customer on leave' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Customer unavailable' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Customer requested skip' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Other' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm skip' })).toHaveProp(
    'accessibilityState',
    { disabled: true },
  );

  await fireEvent.press(
    screen.getByRole('button', { name: 'Customer on leave' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm skip' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(mockCaptureOptionalLocation).toHaveBeenCalledWith(true);
  expect(onSubmit.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      outcome: 'skipped_by_agent',
      reasonCode: 'customer_on_leave',
    }),
  );
});

it('shows fixed missed reasons and exposes accessible Other validation', async () => {
  const onSubmit = jest.fn();
  await render(<MissedOutcomeForm {...common} onSubmit={onSubmit} />);

  for (const label of [
    'Address not found',
    'Access blocked',
    'Product unavailable',
    'Vehicle or route issue',
    'Safety issue',
    'Other',
  ]) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }

  await fireEvent.press(screen.getByRole('button', { name: 'Other' }));
  expect(screen.getByRole('button', { name: 'Confirm missed' })).toHaveProp(
    'accessibilityState',
    { disabled: true },
  );
  expect(screen.getByText('Add a note when the reason is Other.')).toHaveProp(
    'accessibilityLiveRegion',
    'polite',
  );

  await fireEvent.changeText(screen.getByLabelText('Note'), ' Gate locked ');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm missed' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      outcome: 'missed',
      reasonCode: 'other',
      note: 'Gate locked',
    }),
  );
});

import {
  buildDeliveredRequest,
  buildReasonRequest,
  validateQuantity,
} from '../forms';

const base = {
  serviceDate: '2026-07-23',
  occurredAt: '2026-07-23T06:30:00.000Z',
  rows: [
    { id: '11111111-1111-4111-8111-111111111111', version: 2 },
    { id: '22222222-2222-4222-8222-222222222222', version: 4 },
  ],
} as const;

it.each(['', '0', '-1', '1.2345', 'one'])(
  'rejects invalid quantity %s',
  (quantity) => {
    expect(() => validateQuantity(quantity)).toThrow(
      'Enter a positive quantity with up to three decimal places.',
    );
  },
);

it.each(['1', '01.250', '0.001'])('accepts valid quantity %s', (quantity) => {
  expect(validateQuantity(quantity)).toBe(quantity);
});

it('builds a delivered-only request for every row', () => {
  expect(
    buildDeliveredRequest(base.serviceDate, base.occurredAt, [
      { ...base.rows[0], actualQuantity: '1.250' },
      { ...base.rows[1], actualQuantity: '2' },
    ]),
  ).toEqual({
    serviceDate: base.serviceDate,
    occurredAt: base.occurredAt,
    outcome: 'delivered',
    items: [
      {
        scheduledDeliveryId: base.rows[0].id,
        expectedVersion: 2,
        actualQuantity: '1.250',
      },
      {
        scheduledDeliveryId: base.rows[1].id,
        expectedVersion: 4,
        actualQuantity: '2',
      },
    ],
  });
});

it('requires a bounded note for other', () => {
  expect(() => buildReasonRequest(base, 'missed', 'other', '')).toThrow(
    'Add a note when the reason is Other.',
  );
  expect(() =>
    buildReasonRequest(base, 'missed', 'other', 'x'.repeat(501)),
  ).toThrow('Note must be 500 characters or fewer.');
});

it('rejects reasons outside the selected outcome taxonomy', () => {
  expect(() =>
    buildReasonRequest(base, 'missed', 'customer_on_leave', ''),
  ).toThrow('Select a valid reason.');
  expect(() =>
    buildReasonRequest(base, 'skipped_by_agent', 'safety_issue', ''),
  ).toThrow('Select a valid reason.');
});

it('trims the note, maps all rows without quantity, and includes only paired coordinates', () => {
  expect(
    buildReasonRequest(
      { ...base, coordinates: { latitude: 19.076, longitude: 72.8777 } },
      'skipped_by_agent',
      'customer_on_leave',
      '  Customer confirmed leave  ',
    ),
  ).toEqual({
    serviceDate: base.serviceDate,
    occurredAt: base.occurredAt,
    outcome: 'skipped_by_agent',
    reasonCode: 'customer_on_leave',
    note: 'Customer confirmed leave',
    latitude: 19.076,
    longitude: 72.8777,
    items: [
      {
        scheduledDeliveryId: base.rows[0].id,
        expectedVersion: 2,
      },
      {
        scheduledDeliveryId: base.rows[1].id,
        expectedVersion: 4,
      },
    ],
  });

  expect(
    buildReasonRequest(
      { ...base, coordinates: { latitude: 19.076 } },
      'missed',
      'address_not_found',
      ' ',
    ),
  ).toEqual({
    serviceDate: base.serviceDate,
    occurredAt: base.occurredAt,
    outcome: 'missed',
    reasonCode: 'address_not_found',
    items: [
      {
        scheduledDeliveryId: base.rows[0].id,
        expectedVersion: 2,
      },
      {
        scheduledDeliveryId: base.rows[1].id,
        expectedVersion: 4,
      },
    ],
  });
});

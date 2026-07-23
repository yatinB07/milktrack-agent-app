import type {
  MissedReasonCode,
  SkipReasonCode,
  StopOutcomeRequest,
} from './types';

export type OutcomeRow = Readonly<{
  id: string;
  version: number;
}>;

export type DisplayOutcomeRow = OutcomeRow &
  Readonly<{
    plannedQuantity: string;
    productName: string;
    unitName: string;
  }>;

export type Coordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

type ReasonRequestBase = Readonly<{
  serviceDate: string;
  occurredAt: string;
  rows: readonly OutcomeRow[];
  coordinates?: Partial<Coordinates>;
}>;

const QUANTITY =
  /^(?:0*[1-9]\d*)(?:\.\d{1,3})?$|^0*\.\d{0,2}[1-9]$/;
const SKIP_REASONS: ReadonlySet<string> = new Set<SkipReasonCode>([
  'customer_on_leave',
  'customer_unavailable',
  'customer_requested_skip_at_door',
  'other',
]);
const MISSED_REASONS: ReadonlySet<string> = new Set<MissedReasonCode>([
  'address_not_found',
  'access_blocked',
  'product_unavailable',
  'vehicle_or_route_issue',
  'safety_issue',
  'other',
]);

export function validateQuantity(value: string) {
  if (!QUANTITY.test(value)) {
    throw new Error(
      'Enter a positive quantity with up to three decimal places.',
    );
  }
  return value;
}

export function buildDeliveredRequest(
  serviceDate: string,
  occurredAt: string,
  rows: readonly (OutcomeRow & { actualQuantity: string })[],
): StopOutcomeRequest {
  return {
    serviceDate,
    occurredAt,
    outcome: 'delivered',
    items: rows.map(({ id, version, actualQuantity }) => ({
      scheduledDeliveryId: id,
      expectedVersion: version,
      actualQuantity: validateQuantity(actualQuantity),
    })),
  };
}

export function buildReasonRequest(
  base: ReasonRequestBase,
  outcome: 'skipped_by_agent' | 'missed',
  reason: string,
  note: string,
): StopOutcomeRequest {
  const reasons = outcome === 'missed' ? MISSED_REASONS : SKIP_REASONS;
  if (!reasons.has(reason)) throw new Error('Select a valid reason.');

  const trimmedNote = note.trim();
  if (reason === 'other' && !trimmedNote) {
    throw new Error('Add a note when the reason is Other.');
  }
  if (trimmedNote.length > 500) {
    throw new Error('Note must be 500 characters or fewer.');
  }

  const coordinates =
    base.coordinates?.latitude !== undefined &&
    base.coordinates.longitude !== undefined
      ? {
          latitude: base.coordinates.latitude,
          longitude: base.coordinates.longitude,
        }
      : {};

  return {
    serviceDate: base.serviceDate,
    occurredAt: base.occurredAt,
    outcome,
    reasonCode: reason,
    ...(trimmedNote ? { note: trimmedNote } : {}),
    ...coordinates,
    items: base.rows.map(({ id, version }) => ({
      scheduledDeliveryId: id,
      expectedVersion: version,
    })),
  } as StopOutcomeRequest;
}

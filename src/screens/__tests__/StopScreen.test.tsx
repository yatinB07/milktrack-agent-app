import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import StopRoute from '../../../app/stops/[routeStopId]';
import { StopOutcomeError } from '@/agent/outcomes/api';
import type { StopOutcomeResult } from '@/agent/outcomes/types';
import { useStopOutcome } from '@/agent/outcomes/useStopOutcome';
import { StopScreen } from '../StopScreen';

const mockBack = jest.fn();
const loadMore = jest.fn();
const refresh = jest.fn();
const submitOutcome = jest.fn();
const resetOutcome = jest.fn();
const mockCaptureOptionalLocation = jest.fn();
const mockClearVendor = jest.fn();
let mockParams: Record<string, string | string[]> = { routeStopId: 'stop-a' };
let mockAuth = { accessToken: 'access-token', status: 'authenticated' };
let mockWorkspace = { status: 'ready', activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor One' }, clearVendor: mockClearVendor };
type MockOutcome = ReturnType<typeof useStopOutcome>;
let mockOutcome: MockOutcome = {
  submit: submitOutcome,
  pending: false,
  result: undefined as StopOutcomeResult | undefined,
  error: undefined as StopOutcomeError | undefined,
  requiresAuthoritativeRefetch: false,
  reset: resetOutcome,
};

const stop = {
  routeStopId: 'stop-a',
  sequence: 7,
  products: [
    {
      id: 'delivery-1', routeStopId: 'stop-a', sequence: 7, routeAssignmentId: 'assignment-1', routeId: 'route-1', serviceDate: '2026-07-22',
      subscriptionId: 'subscription-1', householdId: 'household-1', productId: 'product-1', unitId: 'unit-1', deliverySlotId: 'slot-1',
      plannedQuantity: '1.250', routeCode: 'NORTH-1', routeName: 'North Route', householdAccountNumber: 'H-100', householdName: 'Sharma Household',
      addressLine1: '12 Milk Road', addressLine2: 'Near Central Park', locality: 'Shivajinagar', city: 'Pune', region: 'Maharashtra', postalCode: '411001', countryCode: 'IN',
      productCode: 'MILK', productName: 'Full Cream Milk', unitCode: 'L', unitName: 'Litre', deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
    },
    {
      id: 'delivery-2', routeStopId: 'stop-a', sequence: 7, routeAssignmentId: 'assignment-1', routeId: 'route-1', serviceDate: '2026-07-22',
      subscriptionId: 'subscription-2', householdId: 'household-1', productId: 'product-2', unitId: 'unit-2', deliverySlotId: 'slot-1',
      plannedQuantity: '0.500', routeCode: 'NORTH-1', routeName: 'North Route', householdAccountNumber: 'H-100', householdName: 'Sharma Household',
      addressLine1: '12 Milk Road', addressLine2: 'Near Central Park', locality: 'Shivajinagar', city: 'Pune', region: 'Maharashtra', postalCode: '411001', countryCode: 'IN',
      productCode: 'CURD', productName: 'Fresh Curd', unitCode: 'KG', unitName: 'Kilogram', deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
    },
  ],
  pendingProducts: [
    {
      scheduledDeliveryId: 'delivery-1',
      expectedVersion: 3,
      plannedQuantity: '1.250',
      productName: 'Full Cream Milk',
      unitName: 'Litre',
    },
    {
      scheduledDeliveryId: 'delivery-2',
      expectedVersion: 5,
      plannedQuantity: '0.500',
      productName: 'Fresh Curd',
      unitName: 'Kilogram',
    },
  ],
  completedProducts: [],
  blockedByCustomerLeave: false,
  captureLocationEvidence: true,
};

let mockRoute = {
  status: 'success', loading: false, errorKind: undefined as string | undefined, serviceDate: '2026-07-22', model: {} as object | undefined,
  refresh, loadMore, canLoadMore: false, isLoadingMore: false, paginationError: undefined as string | undefined,
  lastRefreshedAt: 1_000, findStop: (routeStopId: string) => routeStopId === stop.routeStopId ? stop : undefined,
};

jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-linking', () => ({ canOpenURL: jest.fn(), openURL: jest.fn() }));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({ useAgentWorkspace: () => mockWorkspace }));
jest.mock('@/agent/useTodayRoute', () => ({ useTodayRoute: () => mockRoute }));
jest.mock('@/agent/outcomes/useStopOutcome', () => ({ useStopOutcome: jest.fn() }));
jest.mock('@/agent/outcomes/location', () => ({
  captureOptionalLocation: (...args: unknown[]) => mockCaptureOptionalLocation(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockClearVendor.mockResolvedValue(undefined);
  submitOutcome.mockResolvedValue({ routeStopId: 'stop-a', outcome: 'delivered', items: [] });
  mockCaptureOptionalLocation.mockResolvedValue(undefined);
  mockParams = { routeStopId: 'stop-a' };
  mockAuth = { accessToken: 'access-token', status: 'authenticated' };
  mockWorkspace = { status: 'ready', activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor One' }, clearVendor: mockClearVendor };
  mockOutcome = {
    submit: submitOutcome,
    pending: false,
    result: undefined,
    error: undefined,
    requiresAuthoritativeRefetch: false,
    reset: resetOutcome,
  };
  jest.mocked(useStopOutcome).mockImplementation(() => mockOutcome);
  mockRoute = {
    status: 'success', loading: false, errorKind: undefined, serviceDate: '2026-07-22', model: {} as object | undefined,
    refresh, loadMore, canLoadMore: false, isLoadingMore: false, paginationError: undefined,
    lastRefreshedAt: 1_000, findStop: (routeStopId: string) => routeStopId === stop.routeStopId ? stop : undefined,
  };
});

it('blocks every outcome action when customer leave is effective', async () => {
  mockRoute = {
    ...mockRoute,
    findStop: () => ({ ...stop, blockedByCustomerLeave: true }),
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByText('Customer leave · delivery blocked')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Customer on leave / Skip delivery' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Record missed' })).toBeNull();
});

it('submits the complete authoritative pending set with edited delivered quantities', async () => {
  await render(<StopScreen routeStopId="stop-a" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Record delivered' }));
  expect(screen.getByLabelText('Full Cream Milk quantity in Litre')).toHaveProp('value', '1.250');
  expect(screen.getByLabelText('Fresh Curd quantity in Kilogram')).toHaveProp('value', '0.500');
  await fireEvent.changeText(screen.getByLabelText('Fresh Curd quantity in Kilogram'), '0.75');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm delivered' }));

  await waitFor(() => expect(submitOutcome).toHaveBeenCalledTimes(1));
  expect(submitOutcome).toHaveBeenCalledWith({
    serviceDate: '2026-07-22',
    occurredAt: expect.any(String),
    outcome: 'delivered',
    items: [
      { scheduledDeliveryId: 'delivery-1', expectedVersion: 3, actualQuantity: '1.250' },
      { scheduledDeliveryId: 'delivery-2', expectedVersion: 5, actualQuantity: '0.75' },
    ],
  });
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it('submits one skip with reason and note even when optional GPS is denied', async () => {
  await render(<StopScreen routeStopId="stop-a" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Customer on leave / Skip delivery' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Other' }));
  await fireEvent.changeText(screen.getByLabelText('Note'), ' Customer not home ');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm skip' }));

  await waitFor(() => expect(submitOutcome).toHaveBeenCalledTimes(1));
  expect(mockCaptureOptionalLocation).toHaveBeenCalledWith(true);
  expect(submitOutcome).toHaveBeenCalledWith({
    serviceDate: '2026-07-22',
    occurredAt: expect.any(String),
    outcome: 'skipped_by_agent',
    reasonCode: 'other',
    note: 'Customer not home',
    items: [
      { scheduledDeliveryId: 'delivery-1', expectedVersion: 3 },
      { scheduledDeliveryId: 'delivery-2', expectedVersion: 5 },
    ],
  });
});

it('opens the missed action and submits its required reason', async () => {
  await render(<StopScreen routeStopId="stop-a" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Record missed' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Address not found' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm missed' }));

  await waitFor(() => expect(submitOutcome).toHaveBeenCalledWith(expect.objectContaining({
    outcome: 'missed',
    reasonCode: 'address_not_found',
  })));
});

it('disables duplicate submission while the outcome request is pending', async () => {
  const view = await render(<StopScreen routeStopId="stop-a" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Record delivered' }));

  mockOutcome = { ...mockOutcome, pending: true };
  await view.rerender(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('button', { name: 'Confirm delivered' })).toBeDisabled();
});

it('shows the authoritative success without offering another action', async () => {
  mockOutcome = {
    ...mockOutcome,
    result: { routeStopId: 'stop-a', serviceDate: '2026-07-22', outcome: 'delivered', items: [] },
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent('Delivery outcome recorded.');
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
});

it('shows a rejected-input message without inventing an outcome', async () => {
  mockOutcome = { ...mockOutcome, error: new StopOutcomeError('invalid') };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent('Delivery details were rejected. Review the entries and try again.');
  expect(screen.getByRole('button', { name: 'Record delivered' })).toBeTruthy();
});

it('offers no outcome action when the authoritative pending set is empty', async () => {
  mockRoute = {
    ...mockRoute,
    findStop: () => ({ ...stop, pendingProducts: [] }),
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Record missed' })).toBeNull();
});

it.each(['authentication', 'forbidden'] as const)(
  'hides cached stop PII for an outcome %s failure',
  async (kind) => {
    mockOutcome = { ...mockOutcome, error: new StopOutcomeError(kind) };
    await render(<StopScreen routeStopId="stop-a" />);

    expect(screen.getByRole('header', { name: 'Delivery access restricted' })).toBeTruthy();
    expect(screen.queryByText('Sharma Household')).toBeNull();
    if (kind === 'forbidden') {
      await waitFor(() => expect(mockClearVendor).toHaveBeenCalledTimes(1));
    }
  },
);

it.each([
  ['STALE_VERSION', 'This stop changed on the server.'],
  ['INCOMPLETE_STOP_SET', 'The products for this stop changed on the server.'],
  ['DELIVERY_ALREADY_FINALIZED', 'This stop already has a recorded outcome.'],
  ['CUSTOMER_LEAVE_EFFECTIVE', 'Customer leave now blocks this delivery.'],
] as const)('shows safe copy for the typed %s conflict', async (code, copy) => {
  mockOutcome = {
    ...mockOutcome,
    error: new StopOutcomeError('conflict', code),
    requiresAuthoritativeRefetch: true,
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent(copy);
  expect(screen.getByRole('button', { name: 'Check authoritative outcome' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
});

it('refetches instead of resubmitting after an ambiguous response', async () => {
  mockOutcome = {
    ...mockOutcome,
    error: new StopOutcomeError('ambiguous'),
    requiresAuthoritativeRefetch: true,
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent('The server outcome is uncertain. Check before recording anything else.');
  await fireEvent.press(screen.getByRole('button', { name: 'Check authoritative outcome' }));

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(submitOutcome).not.toHaveBeenCalled();
  await waitFor(() => expect(resetOutcome).toHaveBeenCalledTimes(1));
});

it('shows the full stop, exact planned products, accessible controls, and map address', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(true);
  jest.mocked(Linking.openURL).mockResolvedValue(true);
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.getByText('Account H-100')).toBeTruthy();
  expect(screen.getByText('12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN')).toBeTruthy();
  expect(screen.getByText('North Route (NORTH-1)')).toBeTruthy();
  expect(screen.getByText('Morning · 06:00–09:00')).toBeTruthy();
  expect(screen.getByText('Full Cream Milk')).toBeTruthy();
  expect(screen.getByText('1.250 Litre')).toBeTruthy();
  expect(screen.getByText('Fresh Curd')).toBeTruthy();
  expect(screen.getByText('0.500 Kilogram')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

  const mapsButton = screen.getByRole('button', { name: 'Open in maps' });
  expect(mapsButton.props.accessibilityHint).toBe('Opens the address in another app.');
  await fireEvent.press(mapsButton);

  const address = '12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN';
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  expect(Linking.canOpenURL).toHaveBeenCalledWith(url);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
});

it('keeps the address visible and exposes an alert when maps cannot open', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(false);
  await render(<StopScreen routeStopId="stop-a" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Open in maps' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Maps could not be opened. Try again.'));
  expect(screen.getByText('12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN')).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it('loads more only when the agent requests a missing stop page', async () => {
  mockRoute = { ...mockRoute, canLoadMore: true, findStop: () => undefined };
  await render(<StopScreen routeStopId="later-stop" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Load more route data' }));

  expect(loadMore).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Stop no longer available')).toBeNull();
});

it('shows pagination failure for retry and disables the control while loading more', async () => {
  mockRoute = { ...mockRoute, canLoadMore: true, isLoadingMore: true, paginationError: 'unavailable', findStop: () => undefined };
  await render(<StopScreen routeStopId="later-stop" />);

  expect(screen.getByRole('alert')).toHaveTextContent('More route data could not be loaded. Try again.');
  expect(screen.getByRole('button', { name: 'Load more route data' })).toBeDisabled();
});

it('shows an exhausted missing-stop state and uses native back navigation', async () => {
  mockRoute = { ...mockRoute, findStop: () => undefined };
  await render(<StopScreen routeStopId="gone-stop" />);

  expect(screen.getByRole('header', { name: 'Stop no longer available' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('handles loading and unavailable cached data without discarding the stop', async () => {
  mockRoute = { ...mockRoute, status: 'loading', loading: true, model: undefined, findStop: () => undefined };
  const loadingView = await render(<StopScreen routeStopId="stop-a" />);
  expect(screen.getByText('Loading stop')).toBeTruthy();
  await loadingView.unmount();

  mockRoute = { ...mockRoute, status: 'error', loading: false, errorKind: 'unavailable', model: {}, findStop: () => stop };
  await render(<StopScreen routeStopId="stop-a" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Showing saved route data. Some details may be out of date.');
  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
});

it('hides stop PII for authentication and permission errors', async () => {
  mockRoute = { ...mockRoute, status: 'error', errorKind: 'forbidden' };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Delivery access restricted' })).toBeTruthy();
  expect(screen.queryByText('12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN')).toBeNull();
});

it.each(['authentication', 'forbidden'])('hides cached stop PII for %s pagination failures', async (paginationError) => {
  mockRoute = { ...mockRoute, status: 'success', errorKind: undefined, paginationError };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Delivery access restricted' })).toBeTruthy();
  expect(screen.queryByText('12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN')).toBeNull();
});

it.each([
  ['refresh', { errorKind: 'forbidden', paginationError: undefined }],
  ['pagination', { errorKind: undefined, paginationError: 'forbidden' }],
])('clears the cached workspace once for a forbidden %s response', async (_source, failure) => {
  mockRoute = { ...mockRoute, status: 'success', ...failure };
  await render(<StopScreen routeStopId="stop-a" />);

  await waitFor(() => expect(mockClearVendor).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('header', { name: 'Delivery access restricted' })).toBeTruthy();
  expect(screen.queryByText('Sharma Household')).toBeNull();
});

it('passes only routeStopId from the route and ignores injected PII parameters', async () => {
  mockParams = { routeStopId: 'stop-a', householdName: 'Injected Private Name' };
  await render(<StopRoute />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.queryByText('Injected Private Name')).toBeNull();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import StopRoute from '../../../app/stops/[routeStopId]';
import type { OfflineActionState } from '@/offline/types';
import { useStopOutcome } from '@/agent/outcomes/useStopOutcome';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { StopScreen } from '../StopScreen';

const mockBack = jest.fn();
const mockPush = jest.fn();
const refresh = jest.fn();
const submitOutcome = jest.fn();
const resetOutcome = jest.fn();
const mockCaptureOptionalLocation = jest.fn();
const mockClearVendor = jest.fn();
let mockParams: Record<string, string | string[]> = { routeStopId: 'stop-a' };
let mockAuth: Record<string, unknown>;
let mockWorkspace: Record<string, unknown>;
let mockOutcome: Record<string, unknown>;

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
    { scheduledDeliveryId: 'delivery-1', expectedVersion: 3, plannedQuantity: '1.250', productName: 'Full Cream Milk', unitName: 'Litre' },
    { scheduledDeliveryId: 'delivery-2', expectedVersion: 5, plannedQuantity: '0.500', productName: 'Fresh Curd', unitName: 'Kilogram' },
  ],
  completedProducts: [],
  blockedByCustomerLeave: false,
  captureLocationEvidence: true,
};

let mockRoute: Record<string, unknown>;

jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-linking', () => ({ canOpenURL: jest.fn(), openURL: jest.fn() }));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/agent/AgentWorkspaceProvider', () => ({ useAgentWorkspace: () => mockWorkspace }));
jest.mock('@/agent/useTodayRoute', () => ({ useTodayRoute: jest.fn() }));
jest.mock('@/agent/outcomes/useStopOutcome', () => ({ useStopOutcome: jest.fn() }));
jest.mock('@/agent/outcomes/location', () => ({
  captureOptionalLocation: (...args: unknown[]) => mockCaptureOptionalLocation(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockClearVendor.mockResolvedValue(undefined);
  submitOutcome.mockResolvedValue(undefined);
  mockCaptureOptionalLocation.mockResolvedValue(undefined);
  mockParams = { routeStopId: 'stop-a' };
  mockAuth = {
    accessToken: 'access-token',
    status: 'authenticated',
    actor: { userId: 'actor-1', accessMode: 'standard' },
    deviceId: 'device-1',
    offlineScope: { actorId: 'actor-1', deviceId: 'device-1', accessMode: 'standard' },
  };
  mockWorkspace = {
    status: 'ready',
    activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor One' },
    clearVendor: mockClearVendor,
  };
  mockOutcome = {
    submit: submitOutcome,
    pending: false,
    action: undefined,
    error: undefined,
    reset: resetOutcome,
  };
  jest.mocked(useStopOutcome).mockImplementation(() => mockOutcome as never);
  mockRoute = {
    status: 'success',
    loading: false,
    errorKind: undefined,
    serviceDate: '2026-07-22',
    model: {},
    freshness: 'fresh',
    refresh,
    isRefreshing: false,
    lastRefreshedAt: 1_000,
    findStop: (routeStopId: string) => routeStopId === stop.routeStopId ? stop : undefined,
  };
  jest.mocked(useTodayRoute).mockImplementation(() => mockRoute as never);
});

it('submits to the durable hook with the authenticated device scope and does not refetch', async () => {
  await render(<StopScreen routeStopId="stop-a" />);

  expect(useTodayRoute).toHaveBeenCalledWith({
    actorId: 'actor-1',
    vendorId: 'vendor-1',
    accessToken: 'access-token',
    accessMode: 'standard',
  });
  expect(useStopOutcome).toHaveBeenCalledWith({
    scope: {
      actorId: 'actor-1',
      deviceId: 'device-1',
      vendorId: 'vendor-1',
    },
    routeStopId: 'stop-a',
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Record delivered' }));
  await fireEvent.changeText(
    screen.getByLabelText('Fresh Curd quantity in Kilogram'),
    '0.75',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm delivered' }));

  await waitFor(() => expect(submitOutcome).toHaveBeenCalledWith({
    serviceDate: '2026-07-22',
    occurredAt: expect.any(String),
    outcome: 'delivered',
    items: [
      { scheduledDeliveryId: 'delivery-1', expectedVersion: 3, actualQuantity: '1.250' },
      { scheduledDeliveryId: 'delivery-2', expectedVersion: 5, actualQuantity: '0.75' },
    ],
  }));
  expect(refresh).not.toHaveBeenCalled();
});

it.each([
  ['stale', 'Route expired. Refresh before recording a delivery.'],
  ['clock_rollback', 'Device time changed. Refresh the route before recording a delivery.'],
  ['missing', 'No saved route is available. Connect and refresh before recording a delivery.'],
] as const)('blocks outcome entry for a %s route lease with refresh guidance', async (freshness, copy) => {
  mockRoute = { ...mockRoute, freshness };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent(copy);
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh route' }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('blocks outcome entry in offline recovery mode', async () => {
  mockAuth = {
    ...mockAuth,
    actor: { userId: 'actor-1', accessMode: 'offline_recovery', recoveryRouteSyncId: 'sync-1' },
    offlineScope: {
      actorId: 'actor-1',
      deviceId: 'device-1',
      accessMode: 'offline_recovery',
      recoveryRouteSyncId: 'sync-1',
    },
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Outcome entry unavailable' })).toBeTruthy();
  expect(screen.getByText('Finish synchronization recovery before recording a delivery outcome.')).toBeTruthy();
  expect(useStopOutcome).not.toHaveBeenCalled();
});

it.each([
  ['pending', 'Saved on device. Waiting to synchronize.'],
  ['sending', 'Sending delivery outcome to MilkTrack.'],
  ['failed_retryable', 'Synchronization needs retry. Open Synchronization for details.'],
  ['conflict', 'Vendor review required. The saved outcome cannot be changed here.'],
  ['synced', 'Delivery outcome synchronized.'],
] as const)('persistently renders a %s action and blocks another outcome', async (state, copy) => {
  mockOutcome = {
    ...mockOutcome,
    action: { actionId: 'action-1', localSequence: 1, state: state as OfflineActionState },
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent(copy);
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Record missed' })).toBeNull();
});

it('blocks every outcome action when customer leave is effective', async () => {
  mockRoute = {
    ...mockRoute,
    findStop: () => ({ ...stop, blockedByCustomerLeave: true }),
  };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByText('Customer leave · delivery blocked')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record delivered' })).toBeNull();
});

it('reports a local save failure without inventing an action', async () => {
  mockOutcome = { ...mockOutcome, error: new Error('disk unavailable') };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('alert')).toHaveTextContent(
    'The outcome could not be saved on this device. Refresh the route and try again.',
  );
  expect(screen.getByRole('button', { name: 'Record delivered' })).toBeTruthy();
});

it('shows stop details and opens the complete address in maps', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(true);
  jest.mocked(Linking.openURL).mockResolvedValue(true);
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.getByText('1.250 Litre')).toBeTruthy();
  const mapsButton = screen.getByRole('button', { name: 'Open in maps' });
  await fireEvent.press(mapsButton);

  const address = '12 Milk Road, Near Central Park, Shivajinagar, Pune, Maharashtra, 411001, IN';
  expect(Linking.openURL).toHaveBeenCalledWith(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  );
});

it('hides cached stop PII for authentication and permission errors', async () => {
  mockRoute = { ...mockRoute, status: 'error', errorKind: 'forbidden' };
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Delivery access restricted' })).toBeTruthy();
  expect(screen.queryByText('Sharma Household')).toBeNull();
  await waitFor(() => expect(mockClearVendor).toHaveBeenCalledTimes(1));
});

it('passes only routeStopId from the route and ignores injected PII parameters', async () => {
  mockParams = { routeStopId: 'stop-a', householdName: 'Injected Private Name' };
  await render(<StopRoute />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.queryByText('Injected Private Name')).toBeNull();
});

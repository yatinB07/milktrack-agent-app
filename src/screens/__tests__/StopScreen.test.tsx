import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import StopRoute from '../../../app/stops/[routeStopId]';
import { StopScreen } from '../StopScreen';

const mockBack = jest.fn();
const loadMore = jest.fn();
const refresh = jest.fn();
let mockParams: Record<string, string | string[]> = { routeStopId: 'stop-a' };
let mockAuth = { accessToken: 'access-token', status: 'authenticated' };
let mockWorkspace = { status: 'ready', activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor One' } };

const stop = {
  routeStopId: 'stop-a',
  sequence: 7,
  products: [
    {
      id: 'delivery-1', routeStopId: 'stop-a', sequence: 7, routeAssignmentId: 'assignment-1', routeId: 'route-1', serviceDate: '2026-07-22',
      subscriptionId: 'subscription-1', householdId: 'household-1', productId: 'product-1', unitId: 'unit-1', deliverySlotId: 'slot-1',
      plannedQuantity: '1.250', routeCode: 'NORTH-1', routeName: 'North Route', householdAccountNumber: 'H-100', householdName: 'Sharma Household',
      addressLine1: '12 Milk Road', addressLine2: 'Near Central Park', city: 'Pune', region: 'Maharashtra', postalCode: '411001', countryCode: 'IN',
      productCode: 'MILK', productName: 'Full Cream Milk', unitCode: 'L', unitName: 'Litre', deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
    },
    {
      id: 'delivery-2', routeStopId: 'stop-a', sequence: 7, routeAssignmentId: 'assignment-1', routeId: 'route-1', serviceDate: '2026-07-22',
      subscriptionId: 'subscription-2', householdId: 'household-1', productId: 'product-2', unitId: 'unit-2', deliverySlotId: 'slot-1',
      plannedQuantity: '0.500', routeCode: 'NORTH-1', routeName: 'North Route', householdAccountNumber: 'H-100', householdName: 'Sharma Household',
      addressLine1: '12 Milk Road', addressLine2: 'Near Central Park', city: 'Pune', region: 'Maharashtra', postalCode: '411001', countryCode: 'IN',
      productCode: 'CURD', productName: 'Fresh Curd', unitCode: 'KG', unitName: 'Kilogram', deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
    },
  ],
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { routeStopId: 'stop-a' };
  mockAuth = { accessToken: 'access-token', status: 'authenticated' };
  mockWorkspace = { status: 'ready', activeVendor: { vendorId: 'vendor-1', vendorName: 'Vendor One' } };
  mockRoute = {
    status: 'success', loading: false, errorKind: undefined, serviceDate: '2026-07-22', model: {} as object | undefined,
    refresh, loadMore, canLoadMore: false, isLoadingMore: false, paginationError: undefined,
    lastRefreshedAt: 1_000, findStop: (routeStopId: string) => routeStopId === stop.routeStopId ? stop : undefined,
  };
});

it('shows the full stop, exact planned products, accessible controls, and map address', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(true);
  jest.mocked(Linking.openURL).mockResolvedValue(true);
  await render(<StopScreen routeStopId="stop-a" />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.getByText('Account H-100')).toBeTruthy();
  expect(screen.getByText('12 Milk Road, Near Central Park, Pune, Maharashtra, 411001, IN')).toBeTruthy();
  expect(screen.getByText('North Route (NORTH-1)')).toBeTruthy();
  expect(screen.getByText('Morning · 06:00–09:00')).toBeTruthy();
  expect(screen.getByText('Full Cream Milk')).toBeTruthy();
  expect(screen.getByText('1.250 Litre')).toBeTruthy();
  expect(screen.getByText('Fresh Curd')).toBeTruthy();
  expect(screen.getByText('0.500 Kilogram')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Open in maps' }));

  const address = '12 Milk Road, Near Central Park, Pune, Maharashtra, 411001, IN';
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  expect(Linking.canOpenURL).toHaveBeenCalledWith(url);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
});

it('keeps the address visible and exposes an alert when maps cannot open', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(false);
  await render(<StopScreen routeStopId="stop-a" />);

  await fireEvent.press(screen.getByRole('button', { name: 'Open in maps' }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Maps could not be opened. Try again.'));
  expect(screen.getByText('12 Milk Road, Near Central Park, Pune, Maharashtra, 411001, IN')).toBeTruthy();
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
  expect(screen.queryByText('12 Milk Road, Near Central Park, Pune, Maharashtra, 411001, IN')).toBeNull();
});

it('passes only routeStopId from the route and ignores injected PII parameters', async () => {
  mockParams = { routeStopId: 'stop-a', householdName: 'Injected Private Name' };
  await render(<StopRoute />);

  expect(screen.getByRole('header', { name: 'Stop 7 · Sharma Household' })).toBeTruthy();
  expect(screen.queryByText('Injected Private Name')).toBeNull();
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { RouteScreen } from '../RouteScreen';

jest.mock('@/agent/useTodayRoute');
jest.mock('@/agent/AgentWorkspaceProvider');
jest.mock('@/auth/AuthProvider');
jest.mock('@react-native-community/netinfo');
jest.mock('@/components/ConnectivityBanner', () => {
  const { Text } = jest.requireActual('react-native');
  return { ConnectivityBanner: () => <Text>Connection status: Online</Text> };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const retrySession = jest.fn();
const clearVendor = jest.fn();
const refresh = jest.fn();
const loadMore = jest.fn();

const assignment = (id: string, routeName: string) => ({
  id,
  routeId: `route-${id}`,
  deliverySlotId: `slot-${id}`,
  agentMembershipId: 'agent-1',
  serviceDate: '2026-07-22',
  status: 'assigned' as const,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
  routeCode: id.toUpperCase(),
  routeName,
  deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00',
  deliverySlotEndLocalTime: '09:00',
});

const product = (id: string, assignmentId: string, stopId: string, sequence: number, householdName: string) => ({
  id,
  routeAssignmentId: assignmentId,
  routeStopId: stopId,
  sequence,
  routeId: `route-${assignmentId}`,
  serviceDate: '2026-07-22',
  subscriptionId: `subscription-${id}`,
  householdId: `household-${stopId}`,
  productId: `product-${id}`,
  unitId: 'unit-litre',
  deliverySlotId: 'slot-morning',
  plannedQuantity: id === 'milk' ? '1.25' : '2',
  routeCode: assignmentId.toUpperCase(),
  routeName: `Route ${assignmentId}`,
  householdAccountNumber: `H-${stopId}`,
  householdName,
  addressLine1: `${sequence} Market Road`,
  city: 'Pune',
  region: 'MH',
  postalCode: '411001',
  countryCode: 'IN',
  productCode: id.toUpperCase(),
  productName: id === 'milk' ? 'Cow Milk' : 'Curd',
  unitCode: 'L',
  unitName: 'Litre',
  deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00',
  deliverySlotEndLocalTime: '09:00',
});

const beta = assignment('beta', 'Route Beta');
const alpha = assignment('alpha', 'Route Alpha');
const betaStop = product('milk', 'beta', 'stop-beta', 2, 'Mehta Home');
const alphaStop = product('curd', 'alpha', 'stop-alpha', 5, 'Patel Home');
const successRoute = {
  status: 'success' as const,
  loading: false,
  errorKind: undefined,
  serviceDate: '2026-07-22',
  model: {
    serviceDate: '2026-07-22',
    assignments: [
      { assignment: beta, stops: [{ routeStopId: 'stop-beta', sequence: 2, products: [betaStop] }] },
      { assignment: alpha, stops: [{ routeStopId: 'stop-alpha', sequence: 5, products: [alphaStop] }] },
    ],
    unmatchedDeliveryIds: [],
    hasMoreAssignments: false,
    hasMoreDeliveries: false,
  },
  refresh,
  loadMore,
  canLoadMore: false,
  isLoadingMore: false,
  paginationError: undefined,
  lastRefreshedAt: Date.parse('2026-07-22T06:30:00.000Z'),
  findStop: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access-token',
    actor: {
      userId: 'user-agent',
      sessionId: 'session-agent',
      displayName: 'Agent A',
      platformRoles: [],
      memberships: [{ id: 'agent-1', vendorId: 'vendor-a', vendorName: 'Vendor A', role: 'delivery_agent', status: 'active' }],
    },
    requestCode: jest.fn(),
    verifyCode: jest.fn(),
    retrySession,
    signOut: jest.fn(),
  });
  jest.mocked(useAgentWorkspace).mockReturnValue({
    status: 'ready',
    vendors: [{ vendorId: 'vendor-a', vendorName: 'Vendor A' }],
    activeVendor: { vendorId: 'vendor-a', vendorName: 'Vendor A' },
    selectVendor: jest.fn(),
    clearVendor,
  });
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true } as ReturnType<typeof useNetInfo>);
  jest.mocked(useTodayRoute).mockReturnValue(successRoute);
});

it('renders backend-ordered assignment sections and navigates with only the stop ID', async () => {
  await render(<RouteScreen />);

  expect(useTodayRoute).toHaveBeenCalledWith({ vendorId: 'vendor-a', accessToken: 'access-token' });
  expect(screen.getByRole('header', { name: "Today's route" })).toBeTruthy();
  expect(screen.getByText('Agent A · Vendor A')).toBeTruthy();
  expect(screen.getByText('Service date: 2026-07-22')).toBeTruthy();
  expect(screen.getAllByText(/Route (Beta|Alpha)/).map(({ props }) => props.children)).toEqual(['BETA · Route Beta', 'ALPHA · Route Alpha']);
  expect(screen.getAllByText('Morning · 06:00–09:00')).toHaveLength(2);
  expect(screen.getByText('2. Mehta Home · H-stop-beta')).toBeTruthy();
  expect(screen.getByText('2 Market Road, Pune')).toBeTruthy();
  expect(screen.getByText('1.25 Litre · Cow Milk')).toBeTruthy();

  const stopButton = screen.getByRole('button', {
    name: 'Stop 2, Mehta Home, H-stop-beta. 2 Market Road, Pune. 1.25 Litre, Cow Milk.',
  });
  expect(stopButton).toHaveProp('accessibilityHint', 'Opens stop details');
  await fireEvent.press(stopButton);

  expect(router.push).toHaveBeenCalledWith('/stops/stop-beta');
});

it.each([
  [{ status: 'loading', loading: true, model: undefined }, 'Loading today’s route'],
  [{ status: 'success', loading: false, model: { ...successRoute.model, assignments: [] } }, 'No route assigned today'],
  [{ status: 'success', loading: false, canLoadMore: true, model: { ...successRoute.model, assignments: [], hasMoreAssignments: true } }, 'More route data available'],
  [{ status: 'success', loading: false, model: { ...successRoute.model, assignments: [{ assignment: beta, stops: [] }] } }, 'No scheduled stops today'],
  [{ status: 'success', loading: false, canLoadMore: true, model: { ...successRoute.model, assignments: [{ assignment: beta, stops: [] }], hasMoreAssignments: true } }, 'More route data available'],
] as const)('renders the stable route state %#', async (routeState, title) => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, ...routeState } as ReturnType<typeof useTodayRoute>);

  await render(<RouteScreen />);

  expect(screen.getByText(title)).toBeTruthy();
});

it('retries an initial route error', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, status: 'error', model: undefined, errorKind: 'unavailable' });
  await render(<RouteScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

  expect(refresh).toHaveBeenCalledTimes(1);
});

it('refreshes the session after an authentication error', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, status: 'error', model: undefined, errorKind: 'authentication' });
  await render(<RouteScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Sign in again' }));

  expect(retrySession).toHaveBeenCalledTimes(1);
});

it('clears a forbidden vendor workspace and shows the restricted state', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, status: 'error', model: undefined, errorKind: 'forbidden' });
  await render(<RouteScreen />);

  expect(screen.getByText('Route access restricted')).toBeTruthy();
  await waitFor(() => expect(clearVendor).toHaveBeenCalledTimes(1));
});

it('keeps cached stops visible with refresh and pagination errors', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, errorKind: 'unavailable', paginationError: 'unavailable' });
  await render(<RouteScreen />);

  expect(screen.getByRole('button', { name: /Stop 2, Mehta Home/ })).toBeTruthy();
  expect(screen.getByText('Could not refresh the route. Showing saved route data.')).toBeTruthy();
  expect(screen.getByText('Could not load more route data.')).toBeTruthy();
});

it.each([
  ['refresh authentication', { errorKind: 'authentication' as const }, 'Session expired', false],
  ['pagination authentication', { paginationError: 'authentication' as const }, 'Session expired', false],
  ['refresh forbidden', { errorKind: 'forbidden' as const }, 'Route access restricted', true],
  ['pagination forbidden', { paginationError: 'forbidden' as const }, 'Route access restricted', true],
])('hides cached PII after a %s error', async (_case, routeError, title, clearsWorkspace) => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, ...routeError });

  await render(<RouteScreen />);

  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.queryByText('Agent A · Vendor A')).toBeNull();
  expect(screen.queryByText('Service date: 2026-07-22')).toBeNull();
  expect(screen.queryByText('2. Mehta Home · H-stop-beta')).toBeNull();
  expect(screen.queryByText('2 Market Road, Pune')).toBeNull();
  expect(screen.queryByText('1.25 Litre · Cow Milk')).toBeNull();
  if (clearsWorkspace) await waitFor(() => expect(clearVendor).toHaveBeenCalledTimes(1));
  else expect(clearVendor).not.toHaveBeenCalled();
});

it('surfaces exhausted unmatched deliveries as retryable changed route data', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({
    ...successRoute,
    model: {
      ...successRoute.model,
      assignments: [{ assignment: beta, stops: [] }],
      unmatchedDeliveryIds: ['delivery-orphan'],
      hasMoreAssignments: false,
      hasMoreDeliveries: false,
    },
  });

  await render(<RouteScreen />);

  expect(screen.getByRole('alert')).toHaveTextContent('Route data changed');
  expect(screen.queryByText('No scheduled stops today')).toBeNull();
  expect(screen.queryByText('No route assigned today')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

it.each([
  ['assignment', true, false],
  ['delivery', false, true],
])('defers unmatched deliveries while the %s cursor remains', async (_cursor, hasMoreAssignments, hasMoreDeliveries) => {
  jest.mocked(useTodayRoute).mockReturnValue({
    ...successRoute,
    canLoadMore: true,
    model: {
      ...successRoute.model,
      assignments: [],
      unmatchedDeliveryIds: ['delivery-orphan'],
      hasMoreAssignments,
      hasMoreDeliveries,
    },
  });

  await render(<RouteScreen />);

  expect(screen.getByText('More route data available')).toBeTruthy();
  expect(screen.queryByText('Route data changed')).toBeNull();
  expect(screen.queryByText('delivery-orphan')).toBeNull();
});

it('distinguishes offline cached data from an offline route with no cache', async () => {
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: false } as ReturnType<typeof useNetInfo>);
  const { unmount } = await render(<RouteScreen />);
  expect(screen.getByText('Offline. Showing saved route data.')).toBeTruthy();
  await unmount();

  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, status: 'loading', model: undefined });
  await render(<RouteScreen />);
  expect(screen.getByText('No connection')).toBeTruthy();
});

it('loads one page batch and supports pull to refresh', async () => {
  jest.mocked(useTodayRoute).mockReturnValue({ ...successRoute, canLoadMore: true });
  await render(<RouteScreen />);

  expect(screen.getByText(/Last refreshed:/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
  expect(loadMore).toHaveBeenCalledTimes(1);

  const list = screen.getByTestId('today-route-list');
  await act(async () => list.props.refreshControl.props.onRefresh());
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('keeps a warm route render bounded and records route interaction timing', async () => {
  const renderStartedAt = performance.now();
  await render(<RouteScreen />);
  const initialRenderMs = performance.now() - renderStartedAt;

  const list = screen.getByTestId('today-route-list');
  expect(list).toHaveProp('initialNumToRender', 10);
  expect(list).toHaveProp('maxToRenderPerBatch', 10);
  expect(list).toHaveProp('windowSize', 7);

  const interactionStartedAt = performance.now();
  await fireEvent.press(screen.getByRole('button', { name: /Stop 2, Mehta Home/ }));
  const interactionMs = performance.now() - interactionStartedAt;

  if (process.env.REPORT_PERFORMANCE === '1') {
    console.info(JSON.stringify({ initialRenderMs, interactionMs }));
  }

  // These generous CI budgets catch large regressions; physical-device budgets are a Phase 7 gate.
  expect(initialRenderMs).toBeLessThan(1_000);
  expect(interactionMs).toBeLessThan(250);
});

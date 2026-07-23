import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as agentApi from '../api';
import type { AgentRouteAssignmentPage, AgentScheduledDeliveryPage } from '../api';
import { agentRouteAssignmentsQuery, agentScheduledDeliveriesQuery } from '../queries';
import { useTodayRoute } from '../useTodayRoute';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    fetchAgentRouteAssignmentPage: jest.fn(),
    fetchAgentScheduledDeliveryPage: jest.fn(),
  };
});

const request = { vendorId: 'vendor-1', accessToken: 'access-token' };

function assignmentPage(serviceDate: string, ids: string[], nextCursor?: string): AgentRouteAssignmentPage {
  return {
    serviceDate,
    items: ids.map((id) => ({
      id,
      routeId: `route-${id}`,
      deliverySlotId: `slot-${id}`,
      agentMembershipId: 'agent-1',
      serviceDate,
      status: 'assigned',
      createdAt: `${serviceDate}T00:00:00.000Z`,
      updatedAt: `${serviceDate}T00:00:00.000Z`,
      routeCode: id.toUpperCase(),
      routeName: `Route ${id}`,
      deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00',
      deliverySlotEndLocalTime: '09:00',
    })),
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function deliveryPage(
  serviceDate: string,
  rows: readonly (readonly [id: string, assignmentId: string, stopId: string, sequence: number])[],
  nextCursor?: string,
): AgentScheduledDeliveryPage {
  return {
    serviceDate,
    items: rows.map(([id, routeAssignmentId, routeStopId, sequence]) => ({
      id,
      routeAssignmentId,
      routeStopId,
      sequence,
      routeId: `route-${routeAssignmentId}`,
      serviceDate,
      subscriptionId: `subscription-${id}`,
      householdId: `household-${routeStopId}`,
      productId: `product-${id}`,
      unitId: 'unit-1',
      deliverySlotId: 'slot-1',
      plannedQuantity: '1',
      routeCode: routeAssignmentId.toUpperCase(),
      routeName: `Route ${routeAssignmentId}`,
      householdAccountNumber: `H-${routeStopId}`,
      householdName: `Household ${routeStopId}`,
      addressLine1: '1 Test Road',
      city: 'Pune',
      region: 'MH',
      postalCode: '411001',
      countryCode: 'IN',
      productCode: id.toUpperCase(),
      productName: `Product ${id}`,
      unitCode: 'L',
      unitName: 'Litre',
      deliverySlotName: 'Morning',
      deliverySlotStartLocalTime: '06:00',
      deliverySlotEndLocalTime: '09:00',
      currentStatus: 'scheduled',
      version: 1,
      blockedByCustomerLeave: false,
      captureLocationEvidence: false,
      pendingStopItems: [{
        scheduledDeliveryId: id,
        expectedVersion: 1,
        plannedQuantity: '1',
        productName: `Product ${id}`,
        unitName: 'Litre',
      }],
    })),
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...await renderHook(() => useTodayRoute(request), { wrapper }) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('waits for the assignment date before loading and projecting scheduled deliveries', async () => {
  const assignments = deferred<AgentRouteAssignmentPage>();
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockReturnValue(assignments.promise);
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue(
    deliveryPage('2026-07-22', [['milk', 'a', 'stop-a', 1]]),
  );
  const { result } = await setup();

  expect(result.current.status).toBe('loading');
  expect(agentApi.fetchAgentScheduledDeliveryPage).not.toHaveBeenCalled();

  await act(async () => { assignments.resolve(assignmentPage('2026-07-22', ['a'])); });
  await waitFor(() => expect(result.current.status).toBe('success'));

  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenCalledWith({ ...request, serviceDate: '2026-07-22' });
  expect(result.current.serviceDate).toBe('2026-07-22');
  expect(result.current.model?.assignments[0]?.stops[0]?.products[0]?.id).toBe('milk');
  expect(result.current.findStop('stop-a')?.routeStopId).toBe('stop-a');
  expect(result.current.findStop('missing')).toBeUndefined();
});

it('loads both remaining cursors and then only the cursor that remains', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['a'], 'assign-2'))
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['b'], 'assign-3'))
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['c']));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['one', 'a', 'stop-a', 1]], 'delivery-2'))
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['two', 'b', 'stop-b', 2]]));
  const { result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.loadMore());
  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenLastCalledWith({
    ...request, cursor: 'assign-2', serviceDate: '2026-07-22',
  });
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenLastCalledWith({
    ...request, cursor: 'delivery-2', serviceDate: '2026-07-22',
  });
  expect(result.current.canLoadMore).toBe(true);

  await act(() => result.current.loadMore());
  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenLastCalledWith({
    ...request, cursor: 'assign-3', serviceDate: '2026-07-22',
  });
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenCalledTimes(2);
  expect(result.current.canLoadMore).toBe(false);
  expect(result.current.model?.assignments.map(({ assignment }) => assignment.id)).toEqual(['a', 'b', 'c']);
});

it('preserves successful pages and reports a typed partial pagination failure', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['a'], 'assign-2'))
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['b']));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['one', 'a', 'stop-a', 1]], 'delivery-2'))
    .mockRejectedValueOnce(new agentApi.AgentDataError('forbidden'));
  const { result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.loadMore());

  expect(result.current.model?.assignments.map(({ assignment }) => assignment.id)).toEqual(['a', 'b']);
  expect(result.current.model?.assignments[0]?.stops[0]?.products[0]?.id).toBe('one');
  expect(result.current.paginationError).toBe('forbidden');
  expect(result.current.status).toBe('success');
});

it('refreshes from assignment page one and atomically rolls delivery data to its new date', async () => {
  const newDeliveries = deliveryPage('2026-07-23', [['new-milk', 'new', 'new-stop', 1]]);
  const revalidation = deferred<AgentScheduledDeliveryPage>();
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['old']))
    .mockResolvedValueOnce(assignmentPage('2026-07-23', ['new']));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['old-milk', 'old', 'old-stop', 1]]))
    .mockResolvedValueOnce(newDeliveries)
    .mockReturnValueOnce(revalidation.promise);
  const { client, result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.model?.assignments[0]?.stops[0]?.products[0]?.id).toBe('new-milk'));
  await waitFor(() => expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenCalledTimes(3));
  await act(async () => { revalidation.resolve(newDeliveries); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenNthCalledWith(2, request);
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenLastCalledWith({ ...request, serviceDate: '2026-07-23' });
  expect(result.current.serviceDate).toBe('2026-07-23');
  expect(client.getQueryData(agentScheduledDeliveriesQuery({ ...request, serviceDate: '2026-07-22' }).queryKey)).toBeUndefined();
});

it('reports an unavailable error when first assignment and delivery pages disagree', async () => {
  const assignments = assignmentPage('2026-07-22', ['a']);
  const mismatchedDeliveries = deliveryPage('2026-07-23', [['milk', 'a', 'stop-a', 1]]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(agentRouteAssignmentsQuery(request).queryKey, { pages: [assignments], pageParams: [undefined] });
  client.setQueryData(
    agentScheduledDeliveriesQuery({ ...request, serviceDate: '2026-07-22' }).queryKey,
    { pages: [mismatchedDeliveries], pageParams: [undefined] },
  );

  const { result } = await setup(client);

  await waitFor(() => {
    expect(result.current.model).toBeUndefined();
    expect(result.current.status).toBe('error');
    expect(result.current.errorKind).toBe('unavailable');
  });
});

it('rejects a mismatched assignment continuation without projecting it', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['a'], 'assign-2'))
    .mockResolvedValueOnce(assignmentPage('2026-07-23', ['b']));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue(
    deliveryPage('2026-07-22', [['milk', 'a', 'stop-a', 1]]),
  );
  const { result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.loadMore());

  expect(result.current.status).toBe('error');
  expect(result.current.errorKind).toBe('unavailable');
  expect(result.current.model?.assignments.map(({ assignment }) => assignment.id)).toEqual(['a']);
});

it('rejects a mismatched delivery continuation without projecting it', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue(
    assignmentPage('2026-07-22', ['a']),
  );
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['milk', 'a', 'stop-a', 1]], 'delivery-2'))
    .mockResolvedValueOnce(deliveryPage('2026-07-23', [['other', 'a', 'stop-a', 1]]));
  const { result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.loadMore());

  expect(result.current.status).toBe('error');
  expect(result.current.errorKind).toBe('unavailable');
  expect(result.current.model?.assignments[0]?.stops[0]?.products.map(({ id }) => id)).toEqual(['milk']);
});

it('keeps the prior cache when refresh delivery data reports another date', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['old']))
    .mockResolvedValueOnce(assignmentPage('2026-07-23', ['new']));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage)
    .mockResolvedValueOnce(deliveryPage('2026-07-22', [['old-milk', 'old', 'old-stop', 1]]))
    .mockResolvedValueOnce(deliveryPage('2026-07-24', [['wrong-milk', 'new', 'new-stop', 1]]));
  const { client, result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.refresh());

  expect(result.current.status).toBe('success');
  expect(result.current.errorKind).toBe('unavailable');
  expect(result.current.serviceDate).toBe('2026-07-22');
  expect(result.current.model?.assignments[0]?.stops[0]?.products[0]?.id).toBe('old-milk');
  expect(client.getQueryData(agentScheduledDeliveriesQuery({ ...request, serviceDate: '2026-07-23' }).queryKey)).toBeUndefined();
});

it('keeps cached route data when refresh fails', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage)
    .mockResolvedValueOnce(assignmentPage('2026-07-22', ['a']))
    .mockRejectedValueOnce(new agentApi.AgentDataError('unavailable'));
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue(
    deliveryPage('2026-07-22', [['milk', 'a', 'stop-a', 1]]),
  );
  const { result } = await setup();
  await waitFor(() => expect(result.current.status).toBe('success'));

  await act(() => result.current.refresh());

  expect(result.current.model?.assignments[0]?.stops[0]?.products[0]?.id).toBe('milk');
  expect(result.current.errorKind).toBe('unavailable');
});

it('reports the older successful query update as route freshness', async () => {
  const assignments = assignmentPage('2026-07-22', ['a']);
  const deliveries = deliveryPage('2026-07-22', [['milk', 'a', 'stop-a', 1]]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(agentRouteAssignmentsQuery(request).queryKey, { pages: [assignments], pageParams: [undefined] }, { updatedAt: 2_000 });
  client.setQueryData(
    agentScheduledDeliveriesQuery({ ...request, serviceDate: '2026-07-22' }).queryKey,
    { pages: [deliveries], pageParams: [undefined] },
    { updatedAt: 1_000 },
  );

  const { result } = await setup(client);
  await waitFor(() => expect(result.current.status).toBe('success'));

  expect(result.current.lastRefreshedAt).toBe(1_000);
  expect(agentApi.fetchAgentRouteAssignmentPage).not.toHaveBeenCalled();
  expect(agentApi.fetchAgentScheduledDeliveryPage).not.toHaveBeenCalled();
});

it('exposes the initial AgentDataError kind without managing the session', async () => {
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockRejectedValue(new agentApi.AgentDataError('authentication'));
  const { result } = await setup();

  await waitFor(() => expect(result.current.status).toBe('error'));

  expect(result.current.errorKind).toBe('authentication');
  expect(result.current.model).toBeUndefined();
  expect(agentApi.fetchAgentScheduledDeliveryPage).not.toHaveBeenCalled();
});

it('treats conflicting pending sets for one stop as unavailable data', async () => {
  const page = deliveryPage('2026-07-22', [
    ['milk', 'a', 'stop-a', 1],
    ['curd', 'a', 'stop-a', 1],
  ]);
  page.items[1]!.pendingStopItems = [{
    scheduledDeliveryId: 'different',
    expectedVersion: 2,
    plannedQuantity: '2',
    productName: 'Different',
    unitName: 'Litre',
  }];
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue(
    assignmentPage('2026-07-22', ['a']),
  );
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue(page);

  const { result } = await setup();

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.errorKind).toBe('unavailable');
  expect(result.current.model).toBeUndefined();
});

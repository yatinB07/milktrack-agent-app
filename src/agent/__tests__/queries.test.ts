import * as agentApi from '../api';
import { agentRouteAssignmentsQuery, agentScheduledDeliveriesQuery } from '../queries';

jest.mock('../api', () => ({
  fetchAgentRouteAssignmentPage: jest.fn(),
  fetchAgentScheduledDeliveryPage: jest.fn(),
}));

const request = { vendorId: 'vendor-1', accessToken: 'access-token' };

it('creates a vendor-scoped assignment infinite query that pins every continuation to the first date', async () => {
  const first = { serviceDate: '2026-07-22', items: [], nextCursor: 'next' };
  const conflictingSecond = { serviceDate: '2026-07-23', items: [], nextCursor: 'last' };
  jest.mocked(agentApi.fetchAgentRouteAssignmentPage).mockResolvedValue(first);
  const options = agentRouteAssignmentsQuery(request);

  expect(options.queryKey).toEqual(['agent', 'vendor-1', 'route-assignments']);
  await expect(options.queryFn?.({ pageParam: undefined } as never)).resolves.toEqual(first);
  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenLastCalledWith(request);
  expect(options.getNextPageParam?.(first, [first], undefined, [undefined])).toEqual({ cursor: 'next', serviceDate: '2026-07-22' });

  await options.queryFn?.({ pageParam: { cursor: 'next', serviceDate: '2026-07-22' } } as never);
  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenLastCalledWith({ ...request, cursor: 'next', serviceDate: '2026-07-22' });

  const lastPageParam = options.getNextPageParam?.(
    conflictingSecond,
    [first, conflictingSecond],
    { cursor: 'next', serviceDate: '2026-07-22' },
    [undefined, { cursor: 'next', serviceDate: '2026-07-22' }],
  );
  expect(lastPageParam).toEqual({ cursor: 'last', serviceDate: '2026-07-22' });
  await options.queryFn?.({ pageParam: lastPageParam } as never);
  expect(agentApi.fetchAgentRouteAssignmentPage).toHaveBeenLastCalledWith({ ...request, cursor: 'last', serviceDate: '2026-07-22' });
});

it('creates a date-scoped scheduled-delivery infinite query', async () => {
  const page = { serviceDate: '2026-07-22', items: [], nextCursor: 'next' };
  jest.mocked(agentApi.fetchAgentScheduledDeliveryPage).mockResolvedValue(page);
  const datedRequest = { ...request, serviceDate: '2026-07-22' };
  const options = agentScheduledDeliveriesQuery(datedRequest);

  expect(options.queryKey).toEqual(['agent', 'vendor-1', 'scheduled-deliveries', '2026-07-22']);
  await expect(options.queryFn?.({ pageParam: undefined } as never)).resolves.toEqual(page);
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenLastCalledWith(datedRequest);
  expect(options.getNextPageParam?.(page, [page], undefined, [undefined])).toBe('next');

  await options.queryFn?.({ pageParam: 'next' } as never);
  expect(agentApi.fetchAgentScheduledDeliveryPage).toHaveBeenLastCalledWith({ ...datedRequest, cursor: 'next' });
});

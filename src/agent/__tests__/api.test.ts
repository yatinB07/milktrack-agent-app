import { api } from '@/api/client';
import {
  AgentDataError,
  fetchAgentRouteAssignmentPage,
  fetchAgentScheduledDeliveryPage,
} from '../api';

jest.mock('@/api/client', () => ({ api: { GET: jest.fn() } }));

const get = api.GET as jest.Mock;
const request = { vendorId: '00000000-0000-4000-8000-000000000001', accessToken: 'secret-access-token' };
const assignment = {
  id: 'assignment-1', routeId: 'route-1', deliverySlotId: 'slot-1', agentMembershipId: 'agent-1',
  serviceDate: '2026-07-22', status: 'assigned' as const, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z',
  routeCode: 'NORTH', routeName: 'North', deliverySlotName: 'Morning', deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
};
const delivery = {
  id: 'delivery-1', subscriptionId: 'subscription-1', householdId: 'household-1', productId: 'product-1', unitId: 'unit-1',
  deliverySlotId: 'slot-1', routeAssignmentId: 'assignment-1', routeStopId: 'stop-1', serviceDate: '2026-07-22',
  plannedQuantity: '1.25', sequence: 1, routeId: 'route-1', routeCode: 'NORTH', routeName: 'North',
  householdAccountNumber: 'H-1', householdName: 'Household', addressLine1: '1 Test Road', city: 'Pune', region: 'MH', postalCode: '411001', countryCode: 'IN',
  productCode: 'MILK', productName: 'Milk', unitCode: 'L', unitName: 'Litre', deliverySlotName: 'Morning',
  deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
};

beforeEach(() => jest.clearAllMocks());

it('fetches the first assignment page without a date and preserves the backend date', async () => {
  get.mockResolvedValueOnce({ data: { serviceDate: '2026-07-22', items: [] } });

  await expect(fetchAgentRouteAssignmentPage(request)).resolves.toEqual({ serviceDate: '2026-07-22', items: [] });
  expect(get).toHaveBeenCalledWith('/v1/agent/vendors/{vendorId}/route-assignments', {
    headers: { authorization: 'Bearer secret-access-token' },
    params: { path: { vendorId: request.vendorId }, query: { limit: 25 } },
  });
});

it('pins assignment continuations to the first response date and forwards the cursor', async () => {
  get.mockResolvedValueOnce({ data: { serviceDate: '2026-07-22', items: [assignment] } });

  await fetchAgentRouteAssignmentPage({ ...request, serviceDate: '2026-07-22', cursor: 'next' });
  expect(get).toHaveBeenCalledWith('/v1/agent/vendors/{vendorId}/route-assignments', {
    headers: { authorization: 'Bearer secret-access-token' },
    params: { path: { vendorId: request.vendorId }, query: { limit: 25, serviceDate: '2026-07-22', cursor: 'next' } },
  });
});

it('fetches scheduled deliveries for the canonical assignment date', async () => {
  get.mockResolvedValueOnce({ data: { serviceDate: '2026-07-22', items: [delivery] } });

  await expect(fetchAgentScheduledDeliveryPage({ ...request, serviceDate: '2026-07-22' })).resolves.toEqual({ serviceDate: '2026-07-22', items: [delivery] });
  expect(get).toHaveBeenCalledWith('/v1/agent/vendors/{vendorId}/scheduled-deliveries', {
    headers: { authorization: 'Bearer secret-access-token' },
    params: { path: { vendorId: request.vendorId }, query: { limit: 25, serviceDate: '2026-07-22' } },
  });
});

it.each([
  [401, 'authentication'],
  [403, 'forbidden'],
  [503, 'unavailable'],
  [500, 'unavailable'],
] as const)('maps status %s to a safe %s error', async (status, kind) => {
  get.mockResolvedValueOnce({ error: { code: 'sensitive-backend-code', message: 'sensitive payload' }, response: { status } });

  const error = await fetchAgentRouteAssignmentPage(request).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AgentDataError);
  expect(error).toMatchObject({ kind });
  expect((error as Error).message).not.toContain('sensitive');
  expect((error as Error).message).not.toContain(request.accessToken);
});

it('maps transport failures to a safe unavailable error', async () => {
  get.mockRejectedValueOnce(new TypeError('sensitive network details'));

  const error = await fetchAgentScheduledDeliveryPage({ ...request, serviceDate: '2026-07-22' }).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AgentDataError);
  expect(error).toMatchObject({ kind: 'unavailable', message: 'Agent data unavailable' });
});

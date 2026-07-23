import type { components, paths } from '@/api/schema';

it('contains the frozen Phase 3 agent contract', () => {
  const read: keyof paths = '/v1/agent/vendors/{vendorId}/scheduled-deliveries';
  const write: keyof paths =
    '/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes';
  const request: components['schemas']['AgentStopOutcomeRequestDto'] = {
    serviceDate: '2026-07-23',
    occurredAt: '2026-07-23T01:05:00.000Z',
    outcome: 'delivered',
    items: [
      {
        scheduledDeliveryId: '11111111-1111-4111-8111-111111111111',
        expectedVersion: 2,
        actualQuantity: '1.25',
      },
    ],
  };

  expect([read, write, request.outcome]).toHaveLength(3);
});

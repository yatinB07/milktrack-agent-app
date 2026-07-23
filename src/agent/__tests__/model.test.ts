import type { AgentRouteAssignmentPage, AgentScheduledDeliveryPage } from '../api';
import { findTodayRouteStop, projectTodayRoute } from '../model';

type Assignment = AgentRouteAssignmentPage['items'][number];
type Delivery = AgentScheduledDeliveryPage['items'][number];

function assignment(id: string): Assignment {
  return {
    id, routeId: `route-${id}`, deliverySlotId: `slot-${id}`, agentMembershipId: 'agent-1', serviceDate: '2026-07-22', status: 'assigned',
    createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', routeCode: id.toUpperCase(), routeName: `Route ${id}`,
    deliverySlotName: 'Morning', deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
  };
}

function delivery(id: string, routeAssignmentId: string, routeStopId: string, sequence: number): Delivery {
  return {
    id, routeAssignmentId, routeStopId, sequence, routeId: `route-${routeAssignmentId}`, serviceDate: '2026-07-22',
    subscriptionId: `subscription-${id}`, householdId: `household-${routeStopId}`, productId: `product-${id}`, unitId: 'unit-1', deliverySlotId: 'slot-1',
    plannedQuantity: '1.25', routeCode: routeAssignmentId.toUpperCase(), routeName: `Route ${routeAssignmentId}`,
    householdAccountNumber: `H-${routeStopId}`, householdName: `Household ${routeStopId}`, addressLine1: '1 Test Road', city: 'Pune', region: 'MH', postalCode: '411001', countryCode: 'IN',
    productCode: id.toUpperCase(), productName: `Product ${id}`, unitCode: 'L', unitName: 'Litre', deliverySlotName: 'Morning',
    deliverySlotStartLocalTime: '06:00', deliverySlotEndLocalTime: '09:00',
    currentStatus: 'scheduled', version: 1, blockedByCustomerLeave: false, captureLocationEvidence: false,
    pendingStopItems: [{ scheduledDeliveryId: id, expectedVersion: 1, plannedQuantity: '1.25', productName: `Product ${id}`, unitName: 'Litre' }],
  };
}

it('preserves assignment order while sorting stops and multi-product rows', () => {
  const stopZFirst = delivery('d3', 'a', 'stop-z', 2);
  const stopZSecond = delivery('d1', 'a', 'stop-z', 2);
  const stopZPending = [
    stopZSecond.pendingStopItems[0]!,
    stopZFirst.pendingStopItems[0]!,
  ];
  const assignmentPages: AgentRouteAssignmentPage[] = [
    { serviceDate: '2026-07-22', items: [assignment('b')], nextCursor: 'assignments-next' },
    { serviceDate: '2026-07-22', items: [assignment('a')] },
  ];
  const deliveryPages: AgentScheduledDeliveryPage[] = [{
    serviceDate: '2026-07-22',
    items: [
      { ...stopZFirst, pendingStopItems: stopZPending }, delivery('d2', 'a', 'stop-b', 1),
      { ...stopZSecond, pendingStopItems: stopZPending }, delivery('d4', 'a', 'stop-a', 1),
    ],
  }];

  const route = projectTodayRoute({ assignmentPages, deliveryPages });

  expect(route.assignments.map(({ assignment: item }) => item.id)).toEqual(['b', 'a']);
  expect(route.assignments[0]?.stops).toEqual([]);
  expect(route.assignments[1]?.stops.map(({ routeStopId }) => routeStopId)).toEqual(['stop-a', 'stop-b', 'stop-z']);
  expect(route.assignments[1]?.stops[2]?.products.map(({ id }) => id)).toEqual(['d1', 'd3']);
  expect(route).toMatchObject({ serviceDate: '2026-07-22', hasMoreAssignments: false, hasMoreDeliveries: false });
});

it('deduplicates repeated pages and reports unmatched deliveries once in backend order', () => {
  const assigned = assignment('a');
  const matched = delivery('matched', 'a', 'stop-a', 1);
  const unmatchedSecond = delivery('unmatched-2', 'missing', 'stop-x', 1);
  const unmatchedFirst = delivery('unmatched-1', 'missing', 'stop-y', 2);

  const route = projectTodayRoute({
    assignmentPages: [
      { serviceDate: '2026-07-22', items: [assigned], nextCursor: 'duplicate-page' },
      { serviceDate: '2026-07-22', items: [assigned] },
    ],
    deliveryPages: [
      { serviceDate: '2026-07-22', items: [unmatchedSecond, matched], nextCursor: 'duplicate-page' },
      { serviceDate: '2026-07-22', items: [matched, unmatchedSecond, unmatchedFirst] },
    ],
  });

  expect(route.assignments).toHaveLength(1);
  expect(route.assignments[0]?.stops[0]?.products.map(({ id }) => id)).toEqual(['matched']);
  expect(route.unmatchedDeliveryIds).toEqual(['unmatched-2', 'unmatched-1']);
});

it('distinguishes partially loaded empty data from exhausted empty data', () => {
  const partial = projectTodayRoute({
    assignmentPages: [{ serviceDate: '2026-07-22', items: [], nextCursor: 'more-assignments' }],
    deliveryPages: [{ serviceDate: '2026-07-22', items: [], nextCursor: 'more-deliveries' }],
  });
  const exhausted = projectTodayRoute({
    assignmentPages: [{ serviceDate: '2026-07-22', items: [] }],
    deliveryPages: [{ serviceDate: '2026-07-22', items: [] }],
  });

  expect(partial).toMatchObject({ assignments: [], hasMoreAssignments: true, hasMoreDeliveries: true });
  expect(exhausted).toMatchObject({ assignments: [], hasMoreAssignments: false, hasMoreDeliveries: false });
});

it('finds a projected stop without inventing a missing result', () => {
  const route = projectTodayRoute({
    assignmentPages: [{ serviceDate: '2026-07-22', items: [assignment('a')] }],
    deliveryPages: [{ serviceDate: '2026-07-22', items: [delivery('d1', 'a', 'stop-a', 1)] }],
  });

  expect(findTodayRouteStop(route, 'stop-a')?.products[0]?.id).toBe('d1');
  expect(findTodayRouteStop(route, 'missing')).toBeUndefined();
});

it('projects the exact pending set and authoritative stop state', () => {
  const pending = {
    ...delivery('pending', 'a', 'stop-a', 1),
    version: 3,
    pendingStopItems: [{
      scheduledDeliveryId: 'pending',
      expectedVersion: 3,
      plannedQuantity: '1.25',
      productName: 'Milk',
      unitName: 'Litre',
    }],
  };
  const leave = {
    ...delivery('leave', 'a', 'stop-a', 1),
    currentStatus: 'skipped_by_customer' as const,
    version: 4,
    blockedByCustomerLeave: true,
    captureLocationEvidence: true,
    pendingStopItems: pending.pendingStopItems,
  };

  const route = projectTodayRoute({
    assignmentPages: [{ serviceDate: '2026-07-22', items: [assignment('a')] }],
    deliveryPages: [{ serviceDate: '2026-07-22', items: [pending, leave] }],
  });
  const stop = route.assignments[0]!.stops[0]!;

  expect(stop.pendingProducts.map(({ scheduledDeliveryId, expectedVersion }) => ({
    scheduledDeliveryId,
    expectedVersion,
  }))).toEqual([{ scheduledDeliveryId: 'pending', expectedVersion: 3 }]);
  expect(stop.completedProducts.map(({ id }) => id)).toEqual(['leave']);
  expect(stop.blockedByCustomerLeave).toBe(true);
  expect(stop.captureLocationEvidence).toBe(true);
  expect(stop.currentOutcome).toBe('skipped_by_customer');
});

it('rejects conflicting complete pending sets for one stop', () => {
  const first = delivery('first', 'a', 'stop-a', 1);
  const second = {
    ...delivery('second', 'a', 'stop-a', 1),
    pendingStopItems: [{
      scheduledDeliveryId: 'other',
      expectedVersion: 2,
      plannedQuantity: '2',
      productName: 'Other',
      unitName: 'Litre',
    }],
  };

  expect(() => projectTodayRoute({
    assignmentPages: [{ serviceDate: '2026-07-22', items: [assignment('a')] }],
    deliveryPages: [{ serviceDate: '2026-07-22', items: [first, second] }],
  })).toThrow('Route data unavailable');
});

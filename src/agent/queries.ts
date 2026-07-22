import { infiniteQueryOptions } from '@tanstack/react-query';
import {
  fetchAgentRouteAssignmentPage,
  fetchAgentScheduledDeliveryPage,
  type AgentDataRequest,
  type AgentScheduledDeliveryPageRequest,
} from './api';

type AssignmentPageParam = Readonly<{ cursor: string; serviceDate: string }> | undefined;

export function agentRouteAssignmentsQuery(request: AgentDataRequest) {
  return infiniteQueryOptions({
    queryKey: ['agent', request.vendorId, 'route-assignments'] as const,
    initialPageParam: undefined as AssignmentPageParam,
    queryFn: ({ pageParam }) => fetchAgentRouteAssignmentPage(pageParam ? { ...request, ...pageParam } : request),
    getNextPageParam: (page, pages) => page.nextCursor ? { cursor: page.nextCursor, serviceDate: pages[0]?.serviceDate ?? page.serviceDate } : undefined,
  });
}

export function agentScheduledDeliveriesQuery(request: AgentScheduledDeliveryPageRequest) {
  return infiniteQueryOptions({
    queryKey: ['agent', request.vendorId, 'scheduled-deliveries', request.serviceDate] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchAgentScheduledDeliveryPage(pageParam ? { ...request, cursor: pageParam } : request),
    getNextPageParam: (page) => page.nextCursor,
  });
}

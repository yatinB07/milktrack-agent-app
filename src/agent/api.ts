import { api } from '@/api/client';
import type { components } from '@/api/schema';

const PAGE_LIMIT = 25;

export type AgentDataRequest = Readonly<{ vendorId: string; accessToken: string }>;
export type AgentRouteAssignmentPageRequest = AgentDataRequest & (
  | Readonly<{ cursor?: never; serviceDate?: never }>
  | Readonly<{ cursor: string; serviceDate: string }>
);
export type AgentScheduledDeliveryPageRequest = AgentDataRequest & Readonly<{ serviceDate: string; cursor?: string }>;
export type AgentRouteAssignmentPage = components['schemas']['AgentRouteAssignmentListResponseDto'];
export type AgentScheduledDeliveryPage = components['schemas']['ScheduledDeliveryListResponseDto'];
export type AgentDataErrorKind = 'authentication' | 'forbidden' | 'unavailable';

export class AgentDataError extends Error {
  constructor(readonly kind: AgentDataErrorKind) {
    super(kind === 'authentication' ? 'Authentication required' : kind === 'forbidden' ? 'Agent access forbidden' : 'Agent data unavailable');
    this.name = 'AgentDataError';
  }
}

function failure(status: number) {
  return new AgentDataError(status === 401 ? 'authentication' : status === 403 ? 'forbidden' : 'unavailable');
}

async function available<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new AgentDataError('unavailable');
  }
}

export async function fetchAgentRouteAssignmentPage({
  vendorId, accessToken, cursor, serviceDate,
}: AgentRouteAssignmentPageRequest): Promise<AgentRouteAssignmentPage> {
  const { data, response } = await available(() => api.GET('/v1/agent/vendors/{vendorId}/route-assignments', {
    headers: { authorization: `Bearer ${accessToken}` },
    params: { path: { vendorId }, query: { limit: PAGE_LIMIT, ...(serviceDate ? { serviceDate } : {}), ...(cursor ? { cursor } : {}) } },
  }));
  if (!data) throw failure(response.status);
  return data;
}

export async function fetchAgentScheduledDeliveryPage({
  vendorId, accessToken, serviceDate, cursor,
}: AgentScheduledDeliveryPageRequest): Promise<AgentScheduledDeliveryPage> {
  const { data, response } = await available(() => api.GET('/v1/agent/vendors/{vendorId}/scheduled-deliveries', {
    headers: { authorization: `Bearer ${accessToken}` },
    params: { path: { vendorId }, query: { limit: PAGE_LIMIT, serviceDate, ...(cursor ? { cursor } : {}) } },
  }));
  if (!data) throw failure(response.status);
  return data;
}

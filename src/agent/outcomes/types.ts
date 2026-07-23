import type { components } from '@/api/schema';

export type StopOutcomeRequest =
  components['schemas']['AgentStopOutcomeRequestDto'];
export type StopOutcomeResult =
  components['schemas']['AgentStopOutcomeResponseDto'];
export type OutcomeKind = StopOutcomeRequest['outcome'];
export type OutcomeConflictCode =
  | 'STALE_VERSION'
  | 'INCOMPLETE_STOP_SET'
  | 'DELIVERY_ALREADY_FINALIZED'
  | 'CUSTOMER_LEAVE_EFFECTIVE';
export type SkipReasonCode =
  | 'customer_on_leave'
  | 'customer_unavailable'
  | 'customer_requested_skip_at_door'
  | 'other';
export type MissedReasonCode =
  | 'address_not_found'
  | 'access_blocked'
  | 'product_unavailable'
  | 'vehicle_or_route_issue'
  | 'safety_issue'
  | 'other';

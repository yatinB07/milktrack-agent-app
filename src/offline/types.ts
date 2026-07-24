import type { paths } from '@/api/schema';
import type {
  AgentRouteAssignmentPage,
  AgentScheduledDeliveryPage,
} from '@/agent/api';

export type ActorDeviceScope = Readonly<{
  actorId: string;
  deviceId: string;
}>;

export type VendorRouteScope = ActorDeviceScope &
  Readonly<{ vendorId: string }>;

export type OfflineAccessScope =
  | (ActorDeviceScope & Readonly<{ accessMode: 'standard' }>)
  | (ActorDeviceScope &
      Readonly<{
        accessMode: 'offline_recovery';
        recoveryRouteSyncId: string;
      }>);

export type OfflineActionState =
  | 'pending'
  | 'sending'
  | 'synced'
  | 'failed_retryable'
  | 'conflict';

export type PendingBlock =
  | 'authentication'
  | 'authorization'
  | 'invariant';

export type CachedAssignment = Omit<
  AgentRouteAssignmentPage['items'][number],
  'createdAt' | 'updatedAt'
>;
export type CachedDelivery = AgentScheduledDeliveryPage['items'][number];
export type CachedRoutePayload = Readonly<{
  assignments: readonly CachedAssignment[];
  deliveries: readonly CachedDelivery[];
}>;

export type OfflineOutcomeRequest =
  paths['/v1/agent/vendors/{vendorId}/route-stops/{routeStopId}/outcomes/offline']['post']['requestBody']['content']['application/json'];

export type OfflineActionDisplay = Readonly<{
  routeId: string;
  routeName: string;
  routeStopId: string;
  sequence: number;
  householdName: string;
  householdAccountNumber: string;
  outcome: OfflineOutcomeRequest['outcome'];
  plannedItems: readonly Readonly<{
    productName: string;
    unitName: string;
    plannedQuantity: string;
  }>[];
}>;

export type RouteLease = Readonly<{
  serverTimeMs: number;
  expiresAtMs: number;
  savedAtWallMs: number;
  retentionDeleteAfterWallMs: number;
}>;

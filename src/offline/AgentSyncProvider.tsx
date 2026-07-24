import { createContext, useContext } from 'react';

import type { OfflineAction } from './action-store';
import type { LeaseFreshness } from './clock';

export type SyncVendorGroup = Readonly<{
  vendorId: string;
  pending: number;
  sending: number;
  synced: number;
  failedRetryable: number;
  conflict: number;
  oldestPendingAtMs: number | null;
  routeFreshness: LeaseFreshness | 'missing';
  lastRouteSyncAtMs: number | null;
  lastActionSyncAtMs: number | null;
}>;

export type AgentSyncView = Readonly<{
  status:
    | 'idle'
    | 'syncing'
    | 'paused_authentication'
    | 'paused_authorization';
  groups: readonly SyncVendorGroup[];
  getAction(actionId: string): OfflineAction | undefined;
  syncNow(): Promise<void>;
  retryNow(actionId: string): Promise<void>;
}>;

const AgentSyncContext = createContext<AgentSyncView | null>(null);

export function useAgentSync() {
  const value = useContext(AgentSyncContext);
  if (!value) {
    throw new Error('Agent synchronization provider is unavailable');
  }
  return value;
}

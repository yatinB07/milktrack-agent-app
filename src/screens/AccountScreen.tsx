import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { countLogoutBlocking } from '@/offline/action-store';

export function AccountScreen() {
  const db = useSQLiteContext();
  const { actor, offlineScope, signOut } = useAuth();
  const { status, vendors, activeVendor } = useAgentWorkspace();
  const { actions, actionsHydrated } = useAgentSync();
  const [confirmedBlockingCount, setConfirmedBlockingCount] = useState(0);
  const [checkingSignOut, setCheckingSignOut] = useState(false);
  const snapshotBlockingCount = actions.filter((action) =>
    action.state === 'pending' || action.state === 'sending' || action.state === 'failed_retryable',
  ).length;
  const blockingCount = Math.max(snapshotBlockingCount, confirmedBlockingCount);
  const safeSignOut = async () => {
    setCheckingSignOut(true);
    try {
      const currentBlockingCount = offlineScope
        ? await countLogoutBlocking(db, offlineScope)
        : 1;
      if (currentBlockingCount > 0) {
        setConfirmedBlockingCount(currentBlockingCount);
        return;
      }
      await signOut();
    } finally {
      setCheckingSignOut(false);
    }
  };
  const canSwitch = status === 'selection-required' || vendors.length > 1;
  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Account</AppText>
    {canSwitch ? <Button label="Switch workspace" onPress={() => router.push('/agent-workspace')} /> : null}
    <StateMessage title={actor?.displayName ?? 'Agent account'} body={activeVendor?.vendorName ?? 'No active vendor assignment'} />
    {!actionsHydrated
      ? <StateMessage
          title="Sign out unavailable"
          body="Checking saved actions on this device before signing out."
        />
      : blockingCount > 0
      ? <StateMessage
          title="Sign out unavailable"
          body={`${blockingCount} unsynchronized action${blockingCount === 1 ? '' : 's'} must be synchronized before signing out.`}
          actionLabel="View synchronization"
          onAction={() => router.push('/sync')}
        />
      : <Button label={checkingSignOut ? 'Checking…' : 'Sign out'} disabled={checkingSignOut} onPress={() => void safeSignOut()} />}
  </Screen>;
}

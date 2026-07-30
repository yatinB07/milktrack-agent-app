import { router } from 'expo-router';
import { useState } from 'react';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';

export function AccountScreen() {
  const { actor, signOut } = useAuth();
  const { status, vendors, activeVendor } = useAgentWorkspace();
  const {
    actions,
    actionsHydrated,
    getLogoutBlockingCount,
  } = useAgentSync();
  const [confirmedBlockingCount, setConfirmedBlockingCount] = useState(0);
  const [checkingSignOut, setCheckingSignOut] = useState(false);
  const snapshotBlockingCount = actions.filter((action) =>
    action.state === 'pending' || action.state === 'sending' || action.state === 'failed_retryable',
  ).length;
  const blockingCount = Math.max(snapshotBlockingCount, confirmedBlockingCount);
  const safeSignOut = async () => {
    setCheckingSignOut(true);
    try {
      const currentBlockingCount = await getLogoutBlockingCount();
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
    <AppHeader title="Account" subtitle="Manage this delivery device and workspace." />
    {canSwitch ? <Button label="Switch workspace" onPress={() => router.push('/agent-workspace')} /> : null}
    <Card>
      <AppText variant="h2">Current workspace</AppText>
      <AppText>{actor?.displayName ?? 'Agent account'}</AppText>
      <AppText variant="secondary">{activeVendor?.vendorName ?? 'No active vendor assignment'}</AppText>
      <StatusPill label={activeVendor ? 'Active assignment' : 'No active assignment'} tone={activeVendor ? 'success' : 'warning'} />
    </Card>
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

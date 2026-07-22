import { router } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';

export function AccountScreen() {
  const { actor, signOut } = useAuth();
  const { status, vendors, activeVendor } = useAgentWorkspace();
  const canSwitch = status === 'selection-required' || vendors.length > 1;
  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Account</AppText>
    {canSwitch ? <Button label="Switch workspace" onPress={() => router.push('/agent-workspace')} /> : null}
    <StateMessage title={actor?.displayName ?? 'Agent account'} body={activeVendor?.vendorName ?? 'No active vendor assignment'} actionLabel="Sign out" onAction={() => void signOut()} />
  </Screen>;
}

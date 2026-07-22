import { Redirect, Tabs } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { colors } from '@/theme/tokens';

export default function TabLayout() {
  const { status } = useAuth();
  const { status: workspaceStatus } = useAgentWorkspace();
  if (status === 'loading') return <Screen><StateMessage title="Restoring session" body="Checking this device securely." /></Screen>;
  if (status === 'anonymous') return <Redirect href="/(auth)/phone" />;
  if (workspaceStatus === 'loading') return <Screen><StateMessage title="Loading workspace" body="Checking delivery access securely." /></Screen>;
  if (workspaceStatus === 'selection-required') return <Redirect href="/agent-workspace" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarStyle: { minHeight: 64 } }}><Tabs.Screen name="index" options={{ title: "Today's Route" }} /><Tabs.Screen name="sync" options={{ title: 'Sync' }} /><Tabs.Screen name="account" options={{ title: 'Account' }} /></Tabs>;
}

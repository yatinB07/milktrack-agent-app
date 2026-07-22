import { Redirect } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export default function Index() {
  const { status } = useAuth();
  const { status: workspaceStatus } = useAgentWorkspace();
  if (status === 'loading') return <Screen><StateMessage title="Restoring session" body="Checking this device securely." /></Screen>;
  if (status === 'anonymous') return <Redirect href="/(auth)/phone" />;
  if (workspaceStatus === 'loading') return <Screen><StateMessage title="Loading workspace" body="Checking delivery access securely." /></Screen>;
  return <Redirect href={workspaceStatus === 'selection-required' ? '/agent-workspace' : '/(tabs)'} />;
}

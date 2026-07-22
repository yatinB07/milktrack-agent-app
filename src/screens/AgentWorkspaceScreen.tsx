import { router } from 'expo-router';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function AgentWorkspaceScreen() {
  const { status, vendors, selectVendor } = useAgentWorkspace();

  const chooseVendor = async (vendorId: string) => {
    await selectVendor(vendorId);
    router.replace('/(tabs)');
  };

  if (status === 'loading') return <Screen><StateMessage title="Loading workspaces" body="Checking your active delivery assignments." /></Screen>;
  if (status === 'access-unavailable') return <Screen><StateMessage title="No delivery workspace" body="Ask your vendor administrator for an active delivery-agent assignment." /></Screen>;

  return <Screen>
    <AppText variant="h1">Choose workspace</AppText>
    <AppText>Select the vendor whose route you are delivering.</AppText>
    {vendors.map((vendor) => <Button key={vendor.vendorId} label={vendor.vendorName} onPress={() => void chooseVendor(vendor.vendorId)} />)}
  </Screen>;
}

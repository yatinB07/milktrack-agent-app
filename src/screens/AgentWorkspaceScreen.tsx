import { router } from 'expo-router';
import { useState } from 'react';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function AgentWorkspaceScreen() {
  const { status, vendors, selectVendor } = useAgentWorkspace();
  const [selectionFailed, setSelectionFailed] = useState(false);

  const chooseVendor = async (vendorId: string) => {
    setSelectionFailed(false);
    try {
      await selectVendor(vendorId);
      router.replace('/(tabs)');
    } catch {
      setSelectionFailed(true);
    }
  };

  if (status === 'loading') return <Screen><StateMessage title="Loading workspaces" body="Checking your active delivery assignments." /></Screen>;
  if (status === 'access-unavailable') return <Screen><StateMessage title="No delivery workspace" body="Ask your vendor administrator for an active delivery-agent assignment." /></Screen>;

  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Choose workspace</AppText>
    <AppText>Select the vendor whose route you are delivering.</AppText>
    {selectionFailed ? <Banner tone="error" text="Workspace selection failed. Try again." /> : null}
    {vendors.map((vendor) => <Button key={vendor.vendorId} label={vendor.vendorName} onPress={() => void chooseVendor(vendor.vendorId)} />)}
  </Screen>;
}

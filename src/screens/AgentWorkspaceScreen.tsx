import { router } from 'expo-router';
import { useState } from 'react';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { AppHeader } from '@/components/AppHeader';
import { Banner } from '@/components/Banner';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
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
    <AppHeader title="Choose workspace" subtitle="Choose the vendor workspace for today’s assigned route." />
    {selectionFailed ? <Banner tone="error" text="Workspace selection failed. Try again." /> : null}
    <Card>
      <AppText variant="h2">Assigned vendors</AppText>
      <AppText variant="secondary">Only active vendor assignments are available on this device.</AppText>
      {vendors.map((vendor) => <ListRow key={vendor.vendorId} title={vendor.vendorName} subtitle="Open today’s route" onPress={() => void chooseVendor(vendor.vendorId)} />)}
    </Card>
  </Screen>;
}

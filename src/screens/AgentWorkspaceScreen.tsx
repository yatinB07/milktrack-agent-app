import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { AppText } from '@/components/AppText';
import { AppHeader } from '@/components/AppHeader';
import { Banner } from '@/components/Banner';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { colors, radii, spacing } from '@/theme/tokens';

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
      {vendors.map((vendor) => <Pressable
        key={vendor.vendorId}
        accessibilityRole="button"
        accessibilityLabel={vendor.vendorName}
        onPress={() => void chooseVendor(vendor.vendorId)}
        style={({ pressed }) => [styles.vendorRow, pressed && styles.pressed]}
      >
        <View style={styles.vendorCopy}>
          <AppText variant="h3">{vendor.vendorName}</AppText>
          <AppText variant="secondary" style={styles.subtitle}>Open today’s route</AppText>
        </View>
      </Pressable>)}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  vendorRow: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.panel, borderWidth: 1, minHeight: 48, padding: spacing.lg },
  vendorCopy: { gap: spacing.xs },
  subtitle: { color: colors.secondary },
  pressed: { opacity: 0.75 },
});

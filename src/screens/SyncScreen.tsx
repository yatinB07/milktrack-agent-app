import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import type {
  OfflineActionView,
  SyncVendorGroup,
} from '@/offline/AgentSyncProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Screen } from '@/components/Screen';
import { colors, radii, spacing } from '@/theme/tokens';
import { stateLabel } from './QueuedActionScreen';

const syncStatus = {
  idle: 'Ready to sync',
  syncing: 'Synchronizing',
  paused_authentication: 'Paused — sign in required',
  paused_authorization: 'Paused — access required',
} as const;

export function SyncScreen() {
  const sync = useAgentSync();
  const workspace = useAgentWorkspace();
  const groups = [...sync.groups].sort((left, right) =>
    left.vendorId.localeCompare(right.vendorId),
  );

  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Synchronization</AppText>
    <ConnectivityBanner />
    <AppText accessibilityLiveRegion="polite">Sync status: {syncStatus[sync.status]}</AppText>
    <AppText accessibilityLabel="Synchronization queue changed" accessibilityLiveRegion="polite">
      {groups.length === 0 ? 'No saved synchronization actions.' : `${groups.length} vendor synchronization queues.`}
    </AppText>
    <Button label="Sync now" onPress={() => void sync.syncNow()} />
    {sync.actions.length > 0
      ? <AppText accessibilityRole="header" variant="h2">Synchronization actions</AppText>
      : null}
    {[...sync.actions]
      .sort((left, right) => left.localSequence - right.localSequence)
      .map((action) => <ActionRow key={action.actionId} action={action} />)}
    {groups.map((group) => <VendorQueue
      key={group.vendorId}
      group={group}
      vendorName={workspace.activeVendor?.vendorId === group.vendorId
        ? workspace.activeVendor.vendorName
        : undefined}
    />)}
  </Screen>;
}

function ActionRow({ action }: Readonly<{ action: OfflineActionView }>) {
  const status = stateLabel(action.state);
  return <Pressable
    accessible
    accessibilityRole="button"
    accessibilityLabel={`${status}. ${action.display.householdName}. ${action.display.routeName}. Stop ${action.display.sequence}.`}
    accessibilityHint="Opens synchronization details"
    onPress={() => router.push(action.state === 'conflict'
      ? `/sync-conflicts/${action.actionId}`
      : `/sync-actions/${action.actionId}`)}
    style={styles.action}
  >
    <AppText variant="h3">{status}</AppText>
    <AppText>{action.display.householdName} · {action.display.householdAccountNumber}</AppText>
    <AppText>{action.display.routeName} · Stop {action.display.sequence}</AppText>
  </Pressable>;
}

function VendorQueue({ group, vendorName }: Readonly<{
  group: SyncVendorGroup;
  vendorName?: string;
}>) {
  return <View style={styles.group}>
    <AppText accessibilityRole="header" variant="h2">{vendorName ?? 'Vendor workspace unavailable'}</AppText>
    <AppText>Queue: {group.pending} Saved on device · {group.sending} Sending · {group.synced} Sent to MilkTrack · {group.failedRetryable} Needs retry · {group.conflict} Vendor review required</AppText>
    <AppText>Route freshness: {freshnessLabel(group.routeFreshness)}</AppText>
    <AppText>Oldest queued: {formatTime(group.oldestPendingAtMs)}</AppText>
    <AppText>Last reported route: {formatTime(group.lastRouteSyncAtMs)}</AppText>
    <AppText>Last reported action: {formatTime(group.lastActionSyncAtMs)}</AppText>
  </View>;
}

function freshnessLabel(freshness: SyncVendorGroup['routeFreshness']) {
  if (freshness === 'fresh') return 'Fresh';
  if (freshness === 'stale') return 'Stale';
  return 'Unavailable';
}

function formatTime(value: number | null) {
  return value === null ? 'Unavailable' : new Date(value).toLocaleString();
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.panel,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  action: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.panel,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { OfflineActionView } from '@/offline/AgentSyncProvider';
import { useAgentSync } from '@/offline/AgentSyncProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { colors, radii, spacing } from '@/theme/tokens';

export function QueuedActionScreen({ actionId }: Readonly<{ actionId: string }>) {
  const sync = useAgentSync();
  const action = sync.getAction(actionId);
  const retryable = action?.state === 'failed_retryable';
  const retry = async () => {
    if (retryable) await sync.retryNow(actionId);
  };

  if (!action) return <Unavailable />;

  return <Screen>
    <Button label="Back to synchronization" onPress={() => router.back()} />
    <AppText accessibilityRole="header" variant="h1">Synchronization details</AppText>
    <AppText accessibilityLiveRegion="polite">{stateLabel(action.state)}</AppText>
    <ActionFacts action={action} />
    {retryable ? <RetryButton retry={retry} /> : null}
  </Screen>;
}

function RetryButton({ retry }: Readonly<{ retry(): Promise<void> }>) {
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try { await retry(); } finally { setRunning(false); }
  };
  return <Button label="Retry now" disabled={running} onPress={() => void run()} />;
}

export function ActionFacts({
  action,
  showServerResponse = true,
}: Readonly<{ action: OfflineActionView; showServerResponse?: boolean }>) {
  return <View style={styles.panel}>
    <AppText>Outcome: {outcomeLabel(action.display.outcome)}</AppText>
    <AppText>Service date: {action.serviceDate}</AppText>
    <AppText>Route: {action.display.routeName} ({action.display.routeId}) · Stop {action.routeStopId}</AppText>
    <AppText>Household: {action.display.householdName} · {action.display.householdAccountNumber}</AppText>
    {action.display.plannedItems.map((item) => <AppText key={`${item.productName}-${item.unitName}`}>Planned: {item.plannedQuantity} {item.unitName} · {item.productName}</AppText>)}
    <AppText>Local sequence: {action.localSequence}</AppText>
    <AppText>Occurred: {action.occurredAt}</AppText>
    <AppText>Route lease: {action.routeSyncId}</AppText>
    <AppText>Attempts: {action.attemptCount}</AppText>
    <AppText>Next retry: {formatTime(action.nextAttemptAtMs)}</AppText>
    {action.lastErrorCode || action.lastErrorMessage
      ? <AppText>Safe error: {[action.lastErrorCode, action.lastErrorMessage].filter(Boolean).join(' · ')}</AppText>
      : null}
    {showServerResponse && action.serverResponse !== null ? <AppText>Server result: {safeProjection(action.serverResponse)}</AppText> : null}
  </View>;
}

export function Unavailable() {
  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Sync item unavailable</AppText>
    <StateMessage title="Sync item unavailable" body="This synchronization item is no longer available on this device." />
  </Screen>;
}

export function stateLabel(state: OfflineActionView['state']) {
  if (state === 'pending') return 'Saved on device';
  if (state === 'sending') return 'Sending to MilkTrack';
  if (state === 'synced') return 'Sent to MilkTrack';
  if (state === 'failed_retryable') return 'Needs retry';
  return 'Vendor review required';
}

export function outcomeLabel(outcome: OfflineActionView['display']['outcome']) {
  if (outcome === 'delivered') return 'Delivered';
  if (outcome === 'missed') return 'Missed';
  return 'Customer on leave / Skip delivery';
}

export function formatTime(value: number | null) {
  return value === null ? 'Unavailable' : new Date(value).toLocaleString();
}

export function safeProjection(value: unknown) {
  try { return JSON.stringify(value) ?? 'Unavailable'; } catch { return 'Unavailable'; }
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.panel,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
});

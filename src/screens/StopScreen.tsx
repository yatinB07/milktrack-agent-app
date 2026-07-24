import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { DeliveredOutcomeForm } from '@/agent/outcomes/DeliveredOutcomeForm';
import { MissedOutcomeForm } from '@/agent/outcomes/MissedOutcomeForm';
import { SkipOutcomeForm } from '@/agent/outcomes/SkipOutcomeForm';
import type { StopOutcomeRequest } from '@/agent/outcomes/types';
import { useStopOutcome } from '@/agent/outcomes/useStopOutcome';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { colors, radii, spacing } from '@/theme/tokens';

type ActionMode = 'none' | 'delivered' | 'skipped_by_agent' | 'missed';

export function StopScreen({ routeStopId }: Readonly<{ routeStopId: string }>) {
  const auth = useAuth();
  const workspace = useAgentWorkspace();

  if (auth.status === 'loading' || workspace.status === 'loading') {
    return <StopState title="Loading stop" body="Checking your active delivery route." />;
  }
  if (auth.status !== 'authenticated' || !auth.accessToken) {
    return <StopState title="Delivery access restricted" body="Sign in with an active delivery-agent account to view this stop." />;
  }
  if (auth.actor?.accessMode === 'offline_recovery') {
    return <StopState title="Outcome entry unavailable" body="Finish synchronization recovery before recording a delivery outcome." />;
  }
  if (
    !auth.actor
    || !auth.deviceId
    || auth.offlineScope?.accessMode !== 'standard'
    || auth.offlineScope.actorId !== auth.actor.userId
    || auth.offlineScope.deviceId !== auth.deviceId
  ) {
    return <StopState title="Delivery access restricted" body="The authenticated device scope is unavailable. Sign in again before recording a delivery outcome." />;
  }
  if (workspace.status !== 'ready' || !workspace.activeVendor) {
    return <StopState title="Delivery workspace unavailable" body="Choose an active delivery workspace before viewing this stop." />;
  }

  return <ReadyStopScreen
    routeStopId={routeStopId}
    vendorId={workspace.activeVendor.vendorId}
    accessToken={auth.accessToken}
    actorId={auth.actor.userId}
    deviceId={auth.deviceId}
    clearVendor={workspace.clearVendor}
  />;
}

function ReadyStopScreen({ routeStopId, vendorId, accessToken, actorId, deviceId, clearVendor }: Readonly<{
  routeStopId: string;
  vendorId: string;
  accessToken: string;
  actorId: string;
  deviceId: string;
  clearVendor(): Promise<void>;
}>) {
  const route = useTodayRoute({
    actorId,
    vendorId,
    accessToken,
    accessMode: 'standard',
  });
  const outcome = useStopOutcome({
    scope: { actorId, deviceId, vendorId },
    routeStopId,
  });
  const stop = route.findStop(routeStopId);
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const [mapsFailed, setMapsFailed] = useState(false);
  const [openingMaps, setOpeningMaps] = useState(false);
  const protectedError = route.errorKind === 'authentication'
    || route.errorKind === 'forbidden';
  const forbidden = route.errorKind === 'forbidden';

  useEffect(() => {
    if (forbidden) void clearVendor().catch(() => {});
  }, [clearVendor, forbidden]);

  if (protectedError) {
    return <StopState title="Delivery access restricted" body="This stop cannot be shown with the current delivery-agent access." />;
  }
  if (!stop && route.loading) {
    return <StopState title="Loading stop" body="Loading today’s authorized route data." />;
  }
  if (!stop && route.status === 'error') {
    return <StopState title="Route data unavailable" body="The stop could not be loaded. Your session and saved route data are unchanged." actionLabel="Retry route data" onAction={() => void route.refresh()} />;
  }
  if (!stop || stop.products.length === 0) {
    return <StopState title="Stop no longer available" body="This stop is not present in the loaded route." />;
  }

  const first = stop.products[0]!;
  const address = [first.addressLine1, first.addressLine2, first.locality, first.city, first.region, first.postalCode, first.countryCode]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  const openMaps = async () => {
    setMapsFailed(false);
    setOpeningMaps(true);
    try {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      if (!await Linking.canOpenURL(url)) throw new Error('Maps unavailable');
      await Linking.openURL(url);
    } catch {
      setMapsFailed(true);
    } finally {
      setOpeningMaps(false);
    }
  };
  const rows = stop.pendingProducts.map((product) => ({
    id: product.scheduledDeliveryId,
    version: product.expectedVersion,
    plannedQuantity: product.plannedQuantity,
    productName: product.productName,
    unitName: product.unitName,
  }));
  const formProps = {
    serviceDate: route.serviceDate ?? first.serviceDate,
    occurredAt: new Date().toISOString(),
    rows,
    submitting: outcome.pending,
    onSubmit: submit,
  };

  async function submit(body: StopOutcomeRequest) {
    try {
      await outcome.submit(body);
      setActionMode('none');
    } catch {
      // The durable hook exposes a retry-safe local error without resubmitting.
    }
  }

  return <Screen>
    <BackButton />
    {route.status === 'error' && route.errorKind === 'unavailable'
      ? <Banner tone="warning" text="Showing saved route data. Some details may be out of date." />
      : null}
    <AppText accessibilityRole="header" variant="h1">Stop {stop.sequence} · {first.householdName}</AppText>
    <AppText variant="secondary">Account {first.householdAccountNumber}</AppText>
    <View style={styles.panel}>
      <AppText accessibilityRole="header" variant="h2">Address</AppText>
      <AppText style={styles.wrapping}>{address}</AppText>
      {mapsFailed ? <Banner tone="error" text="Maps could not be opened. Try again." /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the address in another app."
        accessibilityState={{ disabled: openingMaps }}
        disabled={openingMaps}
        onPress={() => void openMaps()}
        style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed, openingMaps && styles.disabled]}
      >
        <AppText variant="action" style={styles.mapButtonLabel}>Open in maps</AppText>
      </Pressable>
    </View>
    <View style={styles.panel}>
      <AppText accessibilityRole="header" variant="h2">Route and slot</AppText>
      <AppText style={styles.wrapping}>{first.routeName} ({first.routeCode})</AppText>
      <AppText style={styles.wrapping}>{first.deliverySlotName} · {first.deliverySlotStartLocalTime}–{first.deliverySlotEndLocalTime}</AppText>
    </View>
    <View style={styles.section}>
      <AppText accessibilityRole="header" variant="h2">Planned products</AppText>
      {stop.products.map((product) => <View key={product.id} style={styles.product}>
        <AppText variant="h3" style={styles.wrapping}>{product.productName}</AppText>
        <AppText>{product.plannedQuantity} {product.unitName}</AppText>
      </View>)}
    </View>
    {stop.blockedByCustomerLeave
      ? <Banner tone="warning" text="Customer leave · delivery blocked" />
      : null}
    {!outcome.actionsHydrated
      ? <Banner tone="warning" text="Checking saved actions on this device before recording a delivery." />
      : outcome.action
      ? <Banner
          tone={outcome.action.blockedReason
            ? 'error'
            : outcome.action.state === 'synced' ? 'success' : 'warning'}
          text={actionMessage(outcome.action)}
        />
      : route.freshness !== 'fresh'
        ? <View style={styles.section}>
          <Banner tone="warning" text={freshnessMessage(route.freshness)} />
          <Button label="Refresh route" disabled={route.isRefreshing} onPress={() => void route.refresh()} />
        </View>
        : stop.pendingProducts.length > 0 && !stop.blockedByCustomerLeave
          ? <View style={styles.section}>
            {outcome.error
              ? <Banner tone="error" text="The outcome could not be saved on this device. Refresh the route and try again." />
              : null}
            {actionMode === 'none' ? <>
              <Button label="Record delivered" disabled={outcome.pending} onPress={() => setActionMode('delivered')} />
              <Button label="Customer on leave / Skip delivery" disabled={outcome.pending} onPress={() => setActionMode('skipped_by_agent')} />
              <Button label="Record missed" disabled={outcome.pending} onPress={() => setActionMode('missed')} />
            </> : null}
            {actionMode === 'delivered' ? <DeliveredOutcomeForm {...formProps} /> : null}
            {actionMode === 'skipped_by_agent'
              ? <SkipOutcomeForm {...formProps} captureLocationEvidence={stop.captureLocationEvidence} />
              : null}
            {actionMode === 'missed'
              ? <MissedOutcomeForm {...formProps} captureLocationEvidence={stop.captureLocationEvidence} />
              : null}
            {actionMode !== 'none'
              ? <Button label="Cancel" disabled={outcome.pending} onPress={() => setActionMode('none')} />
              : null}
          </View>
          : null}
  </Screen>;
}

function actionMessage(action: Readonly<{
  state: 'pending' | 'sending' | 'synced' | 'failed_retryable' | 'conflict';
  blockedReason: 'authentication' | 'authorization' | 'invariant' | null;
}>) {
  if (action.blockedReason === 'authentication') {
    return 'Synchronization paused. Sign in again to send this saved outcome.';
  }
  if (action.blockedReason === 'authorization') {
    return 'Synchronization paused because delivery access was removed. Contact your vendor administrator.';
  }
  if (action.blockedReason === 'invariant') {
    return 'This saved outcome cannot be synchronized automatically. Contact your vendor administrator.';
  }
  if (action.state === 'pending') return 'Saved on device. Waiting to synchronize.';
  if (action.state === 'sending') return 'Sending delivery outcome to MilkTrack.';
  if (action.state === 'failed_retryable') return 'Synchronization needs retry. Open Synchronization for details.';
  if (action.state === 'conflict') return 'Vendor review required. The saved outcome cannot be changed here.';
  return 'Delivery outcome synchronized.';
}

function freshnessMessage(freshness: 'stale' | 'clock_rollback' | 'missing') {
  if (freshness === 'stale') return 'Route expired. Refresh before recording a delivery.';
  if (freshness === 'clock_rollback') return 'Device time changed. Refresh the route before recording a delivery.';
  return 'No saved route is available. Connect and refresh before recording a delivery.';
}

function StopState({ title, body, actionLabel, onAction }: Readonly<{
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}>) {
  return <Screen>
    <BackButton />
    <AppText accessibilityRole="header" variant="h1">{title}</AppText>
    <AppText>{body}</AppText>
    {actionLabel ? <Button label={actionLabel} onPress={onAction} /> : null}
  </Screen>;
}

function BackButton() {
  return <Button label="Back" onPress={() => router.back()} />;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.panel, backgroundColor: colors.surface, padding: spacing.lg },
  section: { gap: spacing.md },
  product: { gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.panel, backgroundColor: colors.surface, padding: spacing.lg },
  mapButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  mapButtonPressed: { backgroundColor: colors.primaryPressed },
  mapButtonLabel: { color: colors.surface },
  disabled: { opacity: 0.5 },
  wrapping: { flexShrink: 1 },
});

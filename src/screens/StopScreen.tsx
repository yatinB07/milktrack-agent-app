import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  if (workspace.status !== 'ready' || !workspace.activeVendor) {
    return <StopState title="Delivery workspace unavailable" body="Choose an active delivery workspace before viewing this stop." />;
  }

  return <ReadyStopScreen routeStopId={routeStopId} vendorId={workspace.activeVendor.vendorId} accessToken={auth.accessToken} clearVendor={workspace.clearVendor} />;
}

function ReadyStopScreen({ routeStopId, vendorId, accessToken, clearVendor }: Readonly<{
  routeStopId: string;
  vendorId: string;
  accessToken: string;
  clearVendor(): Promise<void>;
}>) {
  const route = useTodayRoute({ vendorId, accessToken });
  const outcome = useStopOutcome({ vendorId, routeStopId, accessToken });
  const stop = route.findStop(routeStopId);
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const authoritativeBaseline = useRef<number | null>(null);
  const [checkingAuthoritative, setCheckingAuthoritative] = useState(false);
  const [mapsFailed, setMapsFailed] = useState(false);
  const [openingMaps, setOpeningMaps] = useState(false);
  const protectedError = route.errorKind === 'authentication' || route.errorKind === 'forbidden'
    || route.paginationError === 'authentication' || route.paginationError === 'forbidden'
    || outcome.error?.kind === 'authentication' || outcome.error?.kind === 'forbidden';
  const forbidden = route.errorKind === 'forbidden' || route.paginationError === 'forbidden'
    || outcome.error?.kind === 'forbidden';

  useEffect(() => {
    if (forbidden) void clearVendor().catch(() => {});
  }, [clearVendor, forbidden]);

  useEffect(() => {
    if (
      authoritativeBaseline.current === null
      || route.status !== 'success'
      || !route.lastRefreshedAt
      || route.lastRefreshedAt <= authoritativeBaseline.current
    ) return;
    authoritativeBaseline.current = null;
    outcome.reset();
  }, [outcome, route.lastRefreshedAt, route.status]);

  if (protectedError) {
    return <StopState title="Delivery access restricted" body="This stop cannot be shown with the current delivery-agent access." />;
  }
  if (!stop && route.loading) {
    return <StopState title="Loading stop" body="Loading today’s authorized route data." />;
  }
  if (!stop && route.status === 'error') {
    return <StopState title="Route data unavailable" body="The stop could not be loaded. Your session and saved route data are unchanged." actionLabel="Retry route data" onAction={() => void route.refresh()} />;
  }
  if (!stop && route.canLoadMore) {
    return <Screen>
      <BackButton />
      <AppText accessibilityRole="header" variant="h1">Stop not loaded yet</AppText>
      <AppText>More pages remain in today’s route.</AppText>
      {route.paginationError ? <Banner tone="error" text="More route data could not be loaded. Try again." /> : null}
      <Button label="Load more route data" disabled={route.isLoadingMore} onPress={() => void route.loadMore()} />
    </Screen>;
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
      await route.refresh();
    } catch {
      // The classified hook state chooses the safe recovery path; never retry here.
    }
  }

  async function checkAuthoritativeOutcome() {
    authoritativeBaseline.current = route.lastRefreshedAt ?? 0;
    setActionMode('none');
    setCheckingAuthoritative(true);
    await route.refresh();
    setCheckingAuthoritative(false);
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
    {outcome.result
      ? <Banner tone="success" text="Delivery outcome recorded." />
      : outcome.requiresAuthoritativeRefetch
        ? <View style={styles.section}>
          <Banner tone="warning" text={outcome.error?.kind === 'conflict'
            ? conflictMessage(outcome.error.code)
            : 'The server outcome is uncertain. Check before recording anything else.'} />
          <Button
            label="Check authoritative outcome"
            disabled={checkingAuthoritative}
            onPress={() => void checkAuthoritativeOutcome()}
          />
        </View>
        : stop.pendingProducts.length > 0 && !stop.blockedByCustomerLeave
          ? <View style={styles.section}>
            {outcome.error?.kind === 'invalid'
              ? <Banner tone="error" text="Delivery details were rejected. Review the entries and try again." />
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

function conflictMessage(code?: string) {
  switch (code) {
    case 'INCOMPLETE_STOP_SET':
      return 'The products for this stop changed on the server.';
    case 'DELIVERY_ALREADY_FINALIZED':
      return 'This stop already has a recorded outcome.';
    case 'CUSTOMER_LEAVE_EFFECTIVE':
      return 'Customer leave now blocks this delivery.';
    default:
      return 'This stop changed on the server.';
  }
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

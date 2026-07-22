import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { colors, radii, spacing } from '@/theme/tokens';

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
  const stop = route.findStop(routeStopId);
  const [mapsFailed, setMapsFailed] = useState(false);
  const [openingMaps, setOpeningMaps] = useState(false);
  const protectedError = route.errorKind === 'authentication' || route.errorKind === 'forbidden'
    || route.paginationError === 'authentication' || route.paginationError === 'forbidden';
  const forbidden = route.errorKind === 'forbidden' || route.paginationError === 'forbidden';

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
  </Screen>;
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

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentWorkspace } from '@/agent/AgentWorkspaceProvider';
import type { TodayRouteAssignment, TodayRouteStop } from '@/agent/model';
import { useTodayRoute } from '@/agent/useTodayRoute';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { colors, radii, spacing } from '@/theme/tokens';

export function RouteScreen() {
  const auth = useAuth();
  const workspace = useAgentWorkspace();

  if (auth.status === 'service-unavailable') return <StatusScreen title="MilkTrack is unavailable" body="Your session is preserved. Try again when the service is available." onRetry={auth.retrySession} />;
  if (auth.status === 'permission-denied') return <StatusScreen title="Delivery access restricted" body="This account does not have delivery-agent permission." onRetry={auth.retrySession} />;
  if (auth.status === 'access-unavailable') return <StatusScreen title="No delivery assignment" body="The assignment may be missing, inactive, or suspended. Contact your vendor administrator." onRetry={auth.retrySession} />;
  if (auth.status !== 'authenticated' || !auth.accessToken || !workspace.activeVendor) {
    return <StatusScreen title="Loading today’s route" body="Preparing your delivery workspace." />;
  }

  return <ActiveRouteScreen
    accessToken={auth.accessToken}
    agentName={auth.actor?.displayName ?? 'Delivery agent'}
    vendorId={workspace.activeVendor.vendorId}
    vendorName={workspace.activeVendor.vendorName}
    clearVendor={workspace.clearVendor}
    retrySession={auth.retrySession}
  />;
}

function ActiveRouteScreen({ accessToken, agentName, vendorId, vendorName, clearVendor, retrySession }: Readonly<{
  accessToken: string;
  agentName: string;
  vendorId: string;
  vendorName: string;
  clearVendor(): Promise<void>;
  retrySession(): Promise<void>;
}>) {
  const route = useTodayRoute({ vendorId, accessToken });
  const netInfo = useNetInfo();
  const [refreshing, setRefreshing] = useState(false);
  const sections = route.model?.assignments.map((group) => ({
    group,
    data: group.stops,
  })) ?? [];
  const stopCount = sections.reduce((count, section) => count + section.data.length, 0);
  const offline = netInfo.isConnected === false;
  const errors = [route.errorKind, route.paginationError];
  const accessError = errors.includes('forbidden')
    ? 'forbidden'
    : errors.includes('authentication') ? 'authentication' : undefined;

  useEffect(() => {
    if (accessError === 'forbidden') void clearVendor();
  }, [accessError, clearVendor]);

  const refresh = async () => {
    setRefreshing(true);
    try { await route.refresh(); } finally { setRefreshing(false); }
  };

  if (accessError) {
    const authentication = accessError === 'authentication';
    return <Screen>
      <AppText accessibilityRole="header" variant="h1">Today&apos;s route</AppText>
      <ConnectivityBanner />
      <StateMessage
        title={authentication ? 'Session expired' : 'Route access restricted'}
        body={authentication ? 'Refresh your session to continue.' : 'This vendor workspace is no longer available.'}
        {...(authentication ? { actionLabel: 'Sign in again', onAction: () => void retrySession() } : {})}
      />
    </Screen>;
  }

  if (!route.model) {
    const state: { title: string; body: string; actionLabel?: string; onAction?: () => Promise<void> } = offline
      ? { title: 'No connection', body: 'Connect to the internet to load today’s route.' }
      : route.status === 'loading'
        ? { title: 'Loading today’s route', body: 'Checking today’s route and scheduled stops.' }
        : { title: 'Route unavailable', body: 'Today’s route could not be loaded.', actionLabel: 'Retry', onAction: route.refresh };
    return <Screen>
      <AppText accessibilityRole="header" variant="h1">Today&apos;s route</AppText>
      <AppText>{agentName} · {vendorName}</AppText>
      <AppText>Service date: {route.serviceDate ?? 'Not available'}</AppText>
      <ConnectivityBanner />
      <StateMessage {...state} onAction={state.onAction ? () => void state.onAction?.() : undefined} />
    </Screen>;
  }

  const emptyState: { title: string; body: string; actionLabel?: string; onAction?: () => Promise<void> } | undefined = stopCount === 0 && route.canLoadMore
    ? { title: 'More route data available', body: 'Load the next page to check for scheduled stops.' }
    : sections.length === 0
      ? { title: 'No route assigned today', body: 'There is no route assignment for this service date.', actionLabel: 'Check for route', onAction: route.refresh }
      : stopCount === 0
        ? { title: 'No scheduled stops today', body: 'The assigned route has no scheduled deliveries.' }
        : undefined;

  return <SafeAreaView style={styles.safe}><SectionList
    testID="today-route-list"
    sections={sections}
    keyExtractor={(stop) => stop.routeStopId}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={styles.header}>
      <AppText accessibilityRole="header" variant="h1">Today&apos;s route</AppText>
      <AppText>{agentName} · {vendorName}</AppText>
      <AppText>Service date: {route.model.serviceDate ?? route.serviceDate ?? 'Not available'}</AppText>
      <ConnectivityBanner />
      {offline ? <Banner tone="warning" text="Offline. Showing saved route data." /> : null}
      {route.errorKind ? <Banner tone="warning" text="Could not refresh the route. Showing saved route data." /> : null}
      {route.paginationError ? <Banner tone="warning" text="Could not load more route data." /> : null}
      {route.lastRefreshedAt ? <AppText accessibilityLiveRegion="polite">Last refreshed: {new Date(route.lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</AppText> : null}
    </View>}
    ListFooterComponent={<View style={styles.footer}>
      {emptyState ? <StateMessage title={emptyState.title} body={emptyState.body} actionLabel={emptyState.actionLabel} onAction={emptyState.onAction ? () => void emptyState.onAction?.() : undefined} /> : null}
      {route.canLoadMore ? <Button label={route.isLoadingMore ? 'Loading more…' : 'Load more'} disabled={route.isLoadingMore} onPress={() => void route.loadMore()} /> : null}
    </View>}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    renderSectionHeader={({ section }) => <AssignmentHeader group={section.group} />}
    renderItem={({ item }) => <StopRow stop={item} />}
  /></SafeAreaView>;
}

function AssignmentHeader({ group: { assignment } }: Readonly<{ group: TodayRouteAssignment }>) {
  return <View style={styles.assignmentHeader}>
    <AppText accessibilityRole="header" variant="h2">{`${assignment.routeCode} · ${assignment.routeName}`}</AppText>
    <AppText>{`${assignment.deliverySlotName} · ${assignment.deliverySlotStartLocalTime}–${assignment.deliverySlotEndLocalTime}`}</AppText>
  </View>;
}

function StopRow({ stop }: Readonly<{ stop: TodayRouteStop }>) {
  const first = stop.products[0];
  if (!first) return null;
  const address = [first.addressLine1, first.addressLine2, first.locality, first.city].filter(Boolean).join(', ');
  const products = stop.products.map((product) => `${product.plannedQuantity} ${product.unitName}, ${product.productName}`).join('. ');
  const label = [`Stop ${stop.sequence}, ${first.householdName}, ${first.householdAccountNumber}`, address, products].filter(Boolean).join('. ') + '.';

  return <Pressable
    accessible
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint="Opens stop details"
    onPress={() => router.push(`/stops/${stop.routeStopId}`)}
    style={styles.stop}
  >
    <AppText variant="h3">{`${stop.sequence}. ${first.householdName} · ${first.householdAccountNumber}`}</AppText>
    <AppText>{address}</AppText>
    {stop.products.map((product) => <AppText key={product.id}>{`${product.plannedQuantity} ${product.unitName} · ${product.productName}`}</AppText>)}
  </Pressable>;
}

function StatusScreen({ title, body, onRetry }: Readonly<{ title: string; body: string; onRetry?: () => Promise<void> }>) {
  return <Screen>
    <AppText accessibilityRole="header" variant="h1">Today&apos;s route</AppText>
    <StateMessage title={title} body={body} {...(onRetry ? { actionLabel: 'Retry', onAction: () => void onRetry() } : {})} />
  </Screen>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { backgroundColor: colors.canvas, flexGrow: 1, gap: spacing.md, padding: spacing.xl },
  header: { gap: spacing.sm },
  footer: { gap: spacing.lg },
  assignmentHeader: { backgroundColor: colors.canvas, gap: spacing.xs, paddingTop: spacing.lg },
  stop: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.panel, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
});

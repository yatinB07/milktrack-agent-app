import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';

export function RouteScreen() {
  const { actor, status, retrySession } = useAuth();
  if (status === 'service-unavailable') return <Screen><AppText variant="h1">Today&apos;s route</AppText><StateMessage title="MilkTrack is unavailable" body="Your session is preserved. Try again when the service is available." actionLabel="Retry" onAction={() => void retrySession()} /></Screen>;
  if (status === 'permission-denied') return <Screen><AppText variant="h1">Today&apos;s route</AppText><StateMessage title="Delivery access restricted" body="This account does not have delivery-agent permission." actionLabel="Retry" onAction={() => void retrySession()} /></Screen>;
  if (status === 'access-unavailable') return <Screen><AppText variant="h1">Today&apos;s route</AppText><StateMessage title="No delivery assignment" body="The assignment may be missing, inactive, or suspended. Contact your vendor administrator." actionLabel="Retry" onAction={() => void retrySession()} /></Screen>;
  const assignment = actor?.memberships.find(({ role, status: membershipStatus }) => role === 'delivery_agent' && membershipStatus === 'active');
  return <Screen><AppText variant="h1">Today&apos;s route</AppText><AppText>{actor?.displayName} · {assignment?.vendorName}</AppText><ConnectivityBanner /><Banner tone="info" text="Route sync: Up to date" /><StateMessage title="No route assigned today" body="There are no scheduled stops for this account." actionLabel="Check for route" onAction={() => void retrySession()} /></Screen>;
}

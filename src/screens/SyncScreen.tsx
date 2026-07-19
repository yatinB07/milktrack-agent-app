import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';

export function SyncScreen() {
  const { retrySession, status } = useAuth();
  if (status === 'service-unavailable') return <Screen><AppText variant="h1">Sync</AppText><ConnectivityBanner /><StateMessage title="Synchronization unavailable" body="MilkTrack could not confirm synchronization status." actionLabel="Retry" onAction={() => void retrySession()} /></Screen>;
  if (status !== 'authenticated') return <Screen><AppText variant="h1">Sync</AppText><StateMessage title="Access unavailable" body="An active delivery-agent assignment is required before synchronization." actionLabel="Retry" onAction={() => void retrySession()} /></Screen>;
  return <Screen><AppText variant="h1">Sync</AppText><ConnectivityBanner /><Banner tone="info" text="All changes synchronized" /><StateMessage title="Nothing pending" body="No delivery actions are waiting to synchronize." actionLabel="Check connection" onAction={() => void retrySession()} /></Screen>;
}

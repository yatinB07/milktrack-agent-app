import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function SyncScreen() { return <Screen><AppText variant="h1">Sync</AppText><ConnectivityBanner /><Banner tone="info" text="No action store is configured" /><StateMessage title="Nothing to synchronize" body="No offline actions are stored in this foundation build" actionLabel="Check connection" /></Screen>; }

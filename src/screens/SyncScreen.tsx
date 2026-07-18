import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function SyncScreen() { return <Screen><AppText variant="h1">Sync</AppText><Banner tone="info" text="Connection not checked" /><StateMessage title="Nothing to synchronize" body="No offline actions are stored in this foundation build" actionLabel="Check connection" /></Screen>; }

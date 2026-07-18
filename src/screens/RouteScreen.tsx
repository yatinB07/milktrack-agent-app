import { AppText } from '@/components/AppText';
import { Banner } from '@/components/Banner';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function RouteScreen() { return <Screen><AppText variant="h1">Today&apos;s route</AppText><Banner tone="info" text="Last refreshed: Not refreshed" /><StateMessage title="No route loaded" body="No offline actions are stored in this foundation build" actionLabel="Check for route" /></Screen>; }

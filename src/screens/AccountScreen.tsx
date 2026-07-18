import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export function AccountScreen() { return <Screen><AppText variant="h1">Account</AppText><StateMessage title="Sign in required" body="Sign in to view assignment, help, privacy, and app version." actionLabel="Sign in" /></Screen>; }

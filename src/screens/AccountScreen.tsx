import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/auth/AuthProvider';

export function AccountScreen() {
  const { actor, signOut } = useAuth();
  const assignment = actor?.memberships.find(({ role, status }) => role === 'delivery_agent' && status === 'active');
  return <Screen><AppText variant="h1">Account</AppText><StateMessage title={actor?.displayName ?? 'Agent account'} body={assignment?.vendorName ?? 'No active vendor assignment'} actionLabel="Sign out" onAction={() => void signOut()} /></Screen>;
}

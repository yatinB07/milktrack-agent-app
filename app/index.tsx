import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';

export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <Screen><StateMessage title="Restoring session" body="Checking this device securely." /></Screen>;
  return <Redirect href={status === 'anonymous' ? '/(auth)/phone' : '/(tabs)'} />;
}

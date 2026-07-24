import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { PhoneScreen } from '@/screens/PhoneScreen';

export default function PhoneRoute() {
  const { recoveryRouteSyncIds, requestCode, requestRecoveryCode } = useAuth();
  const openOtp = () => router.push('/(auth)/otp');
  return <PhoneScreen
    recoveryRouteSyncIds={recoveryRouteSyncIds}
    onContinue={async (phone) => { await requestCode(phone); openOtp(); }}
    onRecoveryContinue={async (phone, routeSyncId) => {
      await requestRecoveryCode(phone, routeSyncId);
      openOtp();
    }}
  />;
}

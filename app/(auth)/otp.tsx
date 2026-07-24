import { Redirect, router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { OtpScreen } from '@/screens/OtpScreen';

export default function OtpRoute() {
  const { challenge, requestCode, requestRecoveryCode, verifyCode } = useAuth();
  if (!challenge) return <Redirect href="/(auth)/phone" />;
  return <OtpScreen maskedPhone={`+91 ••••••${challenge.phone.slice(-4)}`} expiresAt={challenge.expiresAt} onVerify={async (code) => { await verifyCode(code); router.replace('/(tabs)'); }} onResend={() => challenge.routeSyncId ? requestRecoveryCode(challenge.phone, challenge.routeSyncId) : requestCode(challenge.phone)} onChangeNumber={() => router.back()} />;
}

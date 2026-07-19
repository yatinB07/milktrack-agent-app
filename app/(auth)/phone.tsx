import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { PhoneScreen } from '@/screens/PhoneScreen';

export default function PhoneRoute() {
  const { requestCode } = useAuth();
  return <PhoneScreen onContinue={async (phone) => { await requestCode(phone); router.push('/(auth)/otp'); }} />;
}

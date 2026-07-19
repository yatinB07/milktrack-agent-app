import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

export default function AuthLayout() {
  const { status } = useAuth();
  return status !== 'anonymous' && status !== 'loading' ? <Redirect href="/(tabs)" /> : <Stack screenOptions={{ headerShown: false }} />;
}

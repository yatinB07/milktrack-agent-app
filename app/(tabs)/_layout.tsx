import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { colors } from '@/theme/tokens';

export default function TabLayout() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'anonymous') return <Redirect href="/(auth)/phone" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarStyle: { minHeight: 64 } }}><Tabs.Screen name="index" options={{ title: "Today's Route" }} /><Tabs.Screen name="sync" options={{ title: 'Sync' }} /><Tabs.Screen name="account" options={{ title: 'Account' }} /></Tabs>;
}

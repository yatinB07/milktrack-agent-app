import { Tabs } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function TabLayout() { return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarStyle: { minHeight: 64 } }}><Tabs.Screen name="index" options={{ title: "Today's Route" }} /><Tabs.Screen name="sync" options={{ title: 'Sync' }} /><Tabs.Screen name="account" options={{ title: 'Account' }} /></Tabs>; }

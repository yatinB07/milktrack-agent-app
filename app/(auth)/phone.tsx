import { router } from 'expo-router';
import { PhoneScreen } from '@/screens/PhoneScreen';

export default function PhoneRoute() { return <PhoneScreen onContinue={() => router.push('/(auth)/otp')} />; }

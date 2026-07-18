import { router } from 'expo-router';
import { OtpScreen } from '@/screens/OtpScreen';

export default function OtpRoute() { return <OtpScreen onVerify={() => router.replace('/(tabs)')} onChangeNumber={() => router.back()} />; }

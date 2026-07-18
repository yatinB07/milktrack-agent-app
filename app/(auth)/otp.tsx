import { router, useLocalSearchParams } from 'expo-router';
import { OtpScreen } from '@/screens/OtpScreen';

export default function OtpRoute() { const { phone } = useLocalSearchParams<{ phone?: string }>(); return <OtpScreen maskedPhone={phone ? `+91 ••••••${phone.slice(-4)}` : undefined} onVerify={() => undefined} onChangeNumber={() => router.back()} />; }

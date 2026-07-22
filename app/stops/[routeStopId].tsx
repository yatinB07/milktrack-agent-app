import { useLocalSearchParams } from 'expo-router';
import { StopScreen } from '@/screens/StopScreen';

export default function StopRoute() {
  const { routeStopId } = useLocalSearchParams<{ routeStopId?: string | string[] }>();
  const id = Array.isArray(routeStopId) ? routeStopId[0] ?? '' : routeStopId ?? '';
  return <StopScreen routeStopId={id} />;
}

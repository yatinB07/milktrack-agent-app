import { useLocalSearchParams } from 'expo-router';

import { QueuedActionScreen } from '@/screens/QueuedActionScreen';

export default function QueuedActionRoute() {
  const { actionId } = useLocalSearchParams<{ actionId?: string | string[] }>();
  return <QueuedActionScreen actionId={Array.isArray(actionId) ? actionId[0] ?? '' : actionId ?? ''} />;
}

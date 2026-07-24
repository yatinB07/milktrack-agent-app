import { useLocalSearchParams } from 'expo-router';

import { ConflictScreen } from '@/screens/ConflictScreen';

export default function ConflictRoute() {
  const { actionId } = useLocalSearchParams<{ actionId?: string | string[] }>();
  return <ConflictScreen actionId={Array.isArray(actionId) ? actionId[0] ?? '' : actionId ?? ''} />;
}

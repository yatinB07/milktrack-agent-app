import { router } from 'expo-router';

import { useAgentSync } from '@/offline/AgentSyncProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ActionFacts, Unavailable, safeProjection } from './QueuedActionScreen';

export function ConflictScreen({ actionId }: Readonly<{ actionId: string }>) {
  const action = useAgentSync().getAction(actionId);
  if (!action || action.state !== 'conflict') return <Unavailable />;

  return <Screen>
    <Button label="Back to synchronization" onPress={() => router.back()} />
    <AppText accessibilityRole="header" variant="h1">Vendor review required</AppText>
    <AppText accessibilityLiveRegion="polite">Vendor review required. The vendor will decide whether a correction is appropriate.</AppText>
    <ActionFacts action={action} showServerResponse={false} />
    <AppText>Conflict reference: {action.conflictId ?? 'Unavailable'}</AppText>
    <AppText>Server result: {safeProjection(action.serverResponse)}</AppText>
  </Screen>;
}

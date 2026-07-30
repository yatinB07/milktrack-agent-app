import { router } from 'expo-router';

import { useAgentSync } from '@/offline/AgentSyncProvider';
import { AppText } from '@/components/AppText';
import { AppHeader } from '@/components/AppHeader';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ActionFacts, Unavailable, safeProjection } from './QueuedActionScreen';

export function ConflictScreen({ actionId }: Readonly<{ actionId: string }>) {
  const action = useAgentSync().getAction(actionId);
  if (!action || action.state !== 'conflict') return <Unavailable />;

  return <Screen>
    <Button label="Back to synchronization" variant="secondary" onPress={() => router.back()} />
    <AppHeader title="Vendor review required" subtitle="This delivery record cannot be changed from the agent app." />
    <Banner tone="warning" text="Vendor review required. The vendor will decide whether a correction is appropriate." />
    <ActionFacts action={action} showServerResponse={false} />
    <Card>
      <AppText accessibilityRole="header" variant="h2">Conflict details</AppText>
      <AppText>Conflict reference: {action.conflictId ?? 'Unavailable'}</AppText>
      <AppText>Server result: {safeProjection(action.serverResponse)}</AppText>
    </Card>
  </Screen>;
}

import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { getHealth } from '@/api/health';
import { spacing } from '@/theme/tokens';
import { Banner } from './Banner';
import { Button } from './Button';

export function ConnectivityBanner() {
  const { isConnected } = useNetInfo();
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => getHealth(signal), retry: 1, enabled: isConnected === true });
  if (isConnected === false) return <Banner tone="warning" text="Connection status: Offline" />;
  if (isConnected === null || health.isPending) return <Banner tone="info" text="Connection status: Checking" />;
  if (health.isError) return <View style={styles.retry}><Banner tone="error" text="MilkTrack service is unavailable. Try again." /><Button label="Retry connection" onPress={() => health.refetch()} /></View>;
  return <Banner tone="success" text="Connection status: Online" />;
}

const styles = StyleSheet.create({ retry: { gap: spacing.md } });

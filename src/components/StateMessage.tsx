import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { colors, radii, spacing } from '@/theme/tokens';

type Props = { title: string; body: string; actionLabel?: string; onAction?: () => void };

export function StateMessage({ title, body, actionLabel, onAction }: Props) {
  return <View style={styles.panel}><AppText variant="h2">{title}</AppText><AppText style={styles.body}>{body}</AppText>{actionLabel ? <Button label={actionLabel} onPress={onAction} /> : null}</View>;
}

const styles = StyleSheet.create({ panel: { gap: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.panel, backgroundColor: colors.surface, padding: spacing.xl }, body: { color: colors.secondary } });

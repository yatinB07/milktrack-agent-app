import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { colors, radii, spacing } from '@/theme/tokens';

type Kind = 'empty' | 'loading' | 'unavailable' | 'restricted' | 'success' | 'failure';
type Props = { kind?: Kind; title: string; body: string; actionLabel?: string; onAction?: () => void };

const palettes = {
  empty: { backgroundColor: colors.surface, borderColor: colors.border },
  loading: { backgroundColor: colors.info.background, borderColor: colors.info.background },
  unavailable: { backgroundColor: colors.warning.background, borderColor: colors.warning.background },
  restricted: { backgroundColor: colors.error.background, borderColor: colors.error.background },
  success: { backgroundColor: colors.success.background, borderColor: colors.success.background },
  failure: { backgroundColor: colors.error.background, borderColor: colors.error.background },
} as const;

export function StateMessage({ kind = 'empty', title, body, actionLabel, onAction }: Props) {
  const alert = kind === 'unavailable' || kind === 'restricted' || kind === 'failure';
  return <View accessible={alert} accessibilityRole={alert ? 'alert' : undefined} style={[styles.panel, palettes[kind]]}><AppText variant="h2">{title}</AppText><AppText style={styles.body}>{body}</AppText>{actionLabel ? <Button label={actionLabel} variant="secondary" onPress={onAction} /> : null}</View>;
}

const styles = StyleSheet.create({ panel: { gap: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.panel, backgroundColor: colors.surface, padding: spacing.xl }, body: { color: colors.secondary } });

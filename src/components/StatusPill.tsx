import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

const tones = { success: colors.success, warning: colors.warning, error: colors.error, info: colors.info } as const;

export function StatusPill({ label, tone = 'info' }: Readonly<{ label: string; tone?: keyof typeof tones }>) {
  const palette = tones[tone];
  return <View accessible accessibilityLabel={label} style={[styles.pill, { backgroundColor: palette.background }]}><AppText variant="caption" style={{ color: palette.foreground }}>{label}</AppText></View>;
}

const styles = StyleSheet.create({ pill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs } });

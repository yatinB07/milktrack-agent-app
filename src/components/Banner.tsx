import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme/tokens';

type Tone = 'info' | 'warning' | 'error' | 'success';
const tones = { info: colors.info, warning: colors.warning, error: colors.error, success: colors.success };

export function Banner({ tone, text }: { tone: Tone; text: string }) {
  const palette = tones[tone];
  return <View accessible accessibilityRole="alert" style={[styles.banner, { backgroundColor: palette.background }]}><AppText style={{ color: palette.foreground }}>{text}</AppText></View>;
}

const styles = StyleSheet.create({ banner: { borderRadius: radii.panel, padding: spacing.lg } });

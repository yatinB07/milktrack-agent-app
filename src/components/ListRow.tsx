import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

export function ListRow({ title, subtitle, meta, onPress }: Readonly<{ title: string; subtitle?: string; meta?: ReactNode; onPress?: () => void }>) {
  const content = <><View style={styles.copy}><AppText variant="h3">{title}</AppText>{subtitle ? <AppText variant="secondary" style={styles.subtitle}>{subtitle}</AppText> : null}</View>{meta}</>;
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.panel, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 48, padding: spacing.lg }, copy: { flex: 1, gap: spacing.xs }, subtitle: { color: colors.secondary }, pressed: { opacity: 0.75 } });

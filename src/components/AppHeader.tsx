import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

export function AppHeader({ title, subtitle, leading, trailing }: Readonly<{ title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode }>) {
  return <View style={styles.row}>
    {leading}
    <View style={styles.copy}>
      <AppText accessibilityRole="header" variant="h1">{title}</AppText>
      {subtitle ? <AppText variant="secondary" style={styles.subtitle}>{subtitle}</AppText> : null}
    </View>
    {trailing}
  </View>;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, copy: { flex: 1, gap: spacing.xs }, subtitle: { color: colors.secondary } });

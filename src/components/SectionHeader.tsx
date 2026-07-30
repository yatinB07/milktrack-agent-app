import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { AppText } from './AppText';

export function SectionHeader({ title, action }: Readonly<{ title: string; action?: ReactNode }>) {
  return <View style={styles.row}><AppText accessibilityRole="header" variant="h2">{title}</AppText>{action}</View>;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md } });

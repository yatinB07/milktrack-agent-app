import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radii, spacing } from '@/theme/tokens';

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.panel, borderWidth: 1, gap: spacing.md, padding: spacing.lg } });

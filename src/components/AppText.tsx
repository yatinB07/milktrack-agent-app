import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, type } from '@/theme/tokens';

type Variant = keyof typeof type;

export function AppText({ children, variant = 'body', style, ...props }: PropsWithChildren<TextProps & { variant?: Variant }>) {
  return <Text {...props} style={[styles.text, type[variant], style]}>{children}</Text>;
}

const styles = StyleSheet.create({ text: { color: colors.text } });

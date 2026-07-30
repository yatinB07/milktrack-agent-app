import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'destructive';
type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', loading = false, icon, disabled = false, style, ...props }: Props) {
  const unavailable = disabled || loading;
  return <Pressable
    {...props}
    accessibilityRole="button"
    accessibilityState={loading ? { disabled: unavailable, busy: true } : { disabled: unavailable }}
    disabled={unavailable}
    style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, unavailable && styles.disabled, style]}
  >
    <View style={styles.content}>
      {icon}
      <AppText variant="action" style={variant === 'secondary' ? styles.secondaryLabel : styles.label}>{loading ? `${label}…` : label}</AppText>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, borderWidth: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary },
  destructive: { backgroundColor: colors.error.foreground, borderColor: colors.error.foreground },
  pressed: { backgroundColor: colors.primaryPressed },
  disabled: { opacity: 0.5 },
  label: { color: colors.surface },
  secondaryLabel: { color: colors.primary },
});

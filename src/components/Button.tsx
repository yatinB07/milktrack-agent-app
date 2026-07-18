import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme/tokens';

type Props = { label: string; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> };

export function Button({ label, onPress, disabled = false, style }: Props) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled, style]}><AppText variant="action" style={styles.label}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  pressed: { backgroundColor: colors.primaryPressed },
  disabled: { opacity: 0.5 },
  label: { color: colors.surface },
});

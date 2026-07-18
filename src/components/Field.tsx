import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme/tokens';

type Props = TextInputProps & { label: string; error?: string };

export function Field({ label, error, style, ...props }: Props) {
  return <View style={styles.group}><AppText variant="secondary" style={styles.label}>{label}</AppText><TextInput {...props} accessibilityLabel={label} style={[styles.input, error && styles.invalid, style]} /><AppText accessibilityLiveRegion="polite" variant="secondary" style={styles.error}>{error ?? ''}</AppText></View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm }, label: { fontWeight: '500' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, color: colors.text, fontSize: 16, paddingHorizontal: spacing.lg },
  invalid: { borderColor: colors.error.foreground }, error: { minHeight: 20, color: colors.error.foreground },
});

import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '@/theme/tokens';

type Props = TextInputProps & { label: string; helper?: string; error?: string; prefix?: string };

export function Field({ label, helper, error, prefix, style, ...props }: Props) {
  return <View style={styles.group}>
    <AppText variant="secondary" style={styles.label}>{label}</AppText>
    <View style={styles.inputRow}>
      {prefix ? <AppText style={styles.prefix}>{prefix}</AppText> : null}
      <TextInput {...props} accessibilityLabel={label} style={[styles.input, prefix && styles.prefixedInput, error && styles.invalid, style]} />
    </View>
    {helper ? <AppText variant="secondary" style={styles.helper}>{helper}</AppText> : null}
    {error ? <AppText accessibilityLiveRegion="polite" variant="secondary" style={styles.error}>{error}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs }, label: { fontWeight: '500' },
  inputRow: { alignItems: 'center', flexDirection: 'row' },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, color: colors.text, fontSize: 16, paddingHorizontal: spacing.lg },
  prefixedInput: { borderBottomLeftRadius: 0, borderTopLeftRadius: 0 },
  prefix: { alignSelf: 'stretch', backgroundColor: colors.surface, borderBottomLeftRadius: radii.control, borderColor: colors.border, borderLeftWidth: 1, borderTopLeftRadius: radii.control, borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  invalid: { borderColor: colors.error.foreground }, helper: { color: colors.secondary }, error: { color: colors.error.foreground },
});

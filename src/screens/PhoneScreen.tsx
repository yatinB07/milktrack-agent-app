import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors, spacing } from '@/theme/tokens';

export function PhoneScreen({ onContinue }: { onContinue: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string>();
  const submit = () => {
    if (!/^\d{10}$/.test(phone)) return setError('Enter a 10-digit phone number');
    setError(undefined);
    onContinue(phone);
  };
  return <Screen><View style={styles.header}><AppText variant="h1">MilkTrack Agent</AppText><AppText style={styles.secondary}>Sign in for today&apos;s delivery work.</AppText></View><View style={styles.phoneRow}><AppText style={styles.prefix}>+91</AppText><Field label="Phone number" value={phone} error={error} keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={10} onChangeText={setPhone} style={styles.field} /></View><AppText variant="secondary" style={styles.secondary}>This device will be linked to your agent session after verification.</AppText><Button label="Continue" onPress={submit} /><Pressable accessibilityRole="link" style={styles.help}><AppText variant="action" style={styles.link}>Help</AppText></Pressable></Screen>;
}

const styles = StyleSheet.create({ header: { gap: spacing.sm }, secondary: { color: colors.secondary }, phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, prefix: { paddingBottom: 28 }, field: { flex: 1 }, help: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, link: { color: colors.primary } });

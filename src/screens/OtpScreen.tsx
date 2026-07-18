import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors, spacing } from '@/theme/tokens';

export function OtpScreen({ onVerify, maskedPhone = '+91 ••••••3210', onChangeNumber }: { onVerify: (code: string) => void; maskedPhone?: string; onChangeNumber?: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const submit = () => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    setError(undefined);
    onVerify(code);
  };
  return <Screen><AppText variant="h1">Verify your phone</AppText><AppText>Enter the code for {maskedPhone}.</AppText><Field label="Six-digit code" value={code} error={error} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} /><AppText variant="secondary" style={styles.secondary}>Resend code when available</AppText><AppText variant="secondary" style={styles.secondary}>Only continue on a device you trust.</AppText><Button label="Verify" onPress={submit} /><Pressable accessibilityRole="button" onPress={onChangeNumber} style={styles.change}><AppText variant="action" style={styles.link}>Change number</AppText></Pressable></Screen>;
}

const styles = StyleSheet.create({ secondary: { color: colors.secondary }, change: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }, link: { color: colors.primary } });

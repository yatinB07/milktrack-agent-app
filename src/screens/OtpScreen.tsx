import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors, spacing } from '@/theme/tokens';
import { AuthError } from '@/auth/api';

export function OtpScreen({ onVerify, onResend, maskedPhone = 'your phone', expiresAt, onChangeNumber }: { onVerify: (code: string) => Promise<void> | void; onResend?: () => Promise<void> | void; maskedPhone?: string; expiresAt?: string; onChangeNumber?: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  useEffect(() => {
    if (!retryAfter) return;
    const timer = setTimeout(() => setRetryAfter((value) => Math.max(0, value - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [retryAfter]);
  const submit = async () => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return setError('Code expired. Request a new code.');
    setError(undefined);
    setBusy(true);
    try { await onVerify(code); }
    catch (cause) {
      setError(
        cause instanceof AuthError && cause.code === 'AUTHENTICATION_FAILED'
          ? 'The code is invalid or expired, or account access is unavailable.'
          : cause instanceof Error ? cause.message : 'Authentication failed',
      );
    }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setError(undefined);
    setResending(true);
    try { await onResend?.(); }
    catch (cause) {
      if (cause instanceof AuthError && cause.retryAfterSeconds) setRetryAfter(cause.retryAfterSeconds);
      else setError(cause instanceof Error ? cause.message : 'Unable to resend the code');
    } finally { setResending(false); }
  };
  const fieldError = retryAfter ? `Try again in ${retryAfter} seconds` : error;
  return <Screen><AppText variant="h1">Verify your phone</AppText><AppText>Enter the code for {maskedPhone}.</AppText><Field label="Six-digit code" value={code} error={fieldError} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} /><Pressable accessibilityRole="button" disabled={busy || resending || retryAfter > 0} onPress={() => void resend()} style={styles.change}><AppText variant="action" style={styles.link}>{resending ? 'Resending…' : 'Resend code'}</AppText></Pressable><AppText variant="secondary" style={styles.secondary}>Only continue on a device you trust.</AppText><Button label={busy ? 'Verifying…' : 'Verify'} disabled={busy} onPress={() => void submit()} /><Pressable accessibilityRole="button" onPress={onChangeNumber} style={styles.change}><AppText variant="action" style={styles.link}>Change number</AppText></Pressable></Screen>;
}

const styles = StyleSheet.create({ secondary: { color: colors.secondary }, change: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }, link: { color: colors.primary } });

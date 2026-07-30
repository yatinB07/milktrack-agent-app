import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors } from '@/theme/tokens';

export function PhoneScreen({
  onContinue,
  recoveryRouteSyncIds = [],
  onRecoveryContinue,
}: {
  onContinue: (phone: string) => Promise<void> | void;
  recoveryRouteSyncIds?: readonly string[];
  onRecoveryContinue?: (phone: string, routeSyncId: string) => Promise<void> | void;
}) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!/^\d{10}$/.test(phone)) return setError('Enter a 10-digit phone number');
    setError(undefined);
    setBusy(true);
    try { await onContinue(phone); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send a code'); }
    finally { setBusy(false); }
  };
  const recover = async (routeSyncId: string) => {
    if (!/^\d{10}$/.test(phone)) return setError('Enter a 10-digit phone number');
    setError(undefined);
    setBusy(true);
    try { await onRecoveryContinue?.(phone, routeSyncId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send a recovery code'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <AppHeader title="MilkTrack Agent" subtitle="Sign in to manage today’s delivery work." />
    <Card>
      <AppText variant="h2">Your work number</AppText>
      <Field label="Phone number" helper="Use the phone number assigned to your delivery account." prefix="+91" value={phone} error={error} keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={10} onChangeText={setPhone} />
      <AppText variant="secondary" style={styles.secondary}>This device will be linked to your agent session after verification.</AppText>
      <Button label="Continue" loading={busy} onPress={() => void submit()} />
    </Card>
    {recoveryRouteSyncIds.length > 0 ? <Card><AppText variant="h2">Saved delivery recovery</AppText><AppText variant="secondary" style={styles.secondary}>Use the same agent phone to upload deliveries saved before access changed.</AppText>{recoveryRouteSyncIds.map((routeSyncId, index) => <Button key={routeSyncId} variant="secondary" label={`Recover saved deliveries ${index + 1}`} disabled={busy} onPress={() => void recover(routeSyncId)} />)}</Card> : null}
    <AppText variant="secondary" style={styles.secondary}>Need help? Contact your vendor administrator.</AppText>
  </Screen>;
}

const styles = StyleSheet.create({ secondary: { color: colors.secondary } });

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { colors, spacing } from '@/theme/tokens';

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
  return <Screen><View style={styles.header}><AppText variant="h1">MilkTrack Agent</AppText><AppText style={styles.secondary}>Sign in for today&apos;s delivery work.</AppText></View><View style={styles.phoneRow}><AppText style={styles.prefix}>+91</AppText><Field label="Phone number" value={phone} error={error} keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={10} onChangeText={setPhone} style={styles.field} /></View><AppText variant="secondary" style={styles.secondary}>This device will be linked to your agent session after verification.</AppText><Button label={busy ? 'Sending…' : 'Continue'} disabled={busy} onPress={() => void submit()} />{recoveryRouteSyncIds.length > 0 ? <View style={styles.recovery}><AppText variant="h2">Saved delivery recovery</AppText><AppText variant="secondary" style={styles.secondary}>Use the same agent phone to upload deliveries saved before access changed.</AppText>{recoveryRouteSyncIds.map((routeSyncId, index) => <Button key={routeSyncId} label={`Recover saved deliveries ${index + 1}`} disabled={busy} onPress={() => void recover(routeSyncId)} />)}</View> : null}<AppText variant="secondary" style={styles.secondary}>Help</AppText></Screen>;
}

const styles = StyleSheet.create({ header: { gap: spacing.sm }, secondary: { color: colors.secondary }, phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, prefix: { paddingBottom: 28 }, field: { flex: 1 }, recovery: { gap: spacing.md } });

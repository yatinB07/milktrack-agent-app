import { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import {
  buildReasonRequest,
  type DisplayOutcomeRow,
} from './forms';
import { captureOptionalLocation } from './location';
import type {
  MissedReasonCode,
  SkipReasonCode,
  StopOutcomeRequest,
} from './types';

type ReasonCode = SkipReasonCode | MissedReasonCode;
type Choice = Readonly<{ code: ReasonCode; label: string }>;

export type ReasonOutcomeFormProps = Readonly<{
  serviceDate: string;
  occurredAt: string;
  rows: readonly DisplayOutcomeRow[];
  captureLocationEvidence?: boolean;
  submitting?: boolean;
  onSubmit: (request: StopOutcomeRequest) => void;
}>;

const SKIP_CHOICES: readonly Choice[] = [
  { code: 'customer_on_leave', label: 'Customer on leave' },
  { code: 'customer_unavailable', label: 'Customer unavailable' },
  {
    code: 'customer_requested_skip_at_door',
    label: 'Customer requested skip',
  },
  { code: 'other', label: 'Other' },
];

export function SkipOutcomeForm(props: ReasonOutcomeFormProps) {
  return (
    <ReasonOutcomeForm
      {...props}
      outcome="skipped_by_agent"
      choices={SKIP_CHOICES}
      submitLabel="Confirm skip"
    />
  );
}

export function ReasonOutcomeForm({
  serviceDate,
  occurredAt,
  rows,
  captureLocationEvidence = false,
  submitting = false,
  onSubmit,
  outcome,
  choices,
  submitLabel,
}: ReasonOutcomeFormProps &
  Readonly<{
    outcome: 'skipped_by_agent' | 'missed';
    choices: readonly Choice[];
    submitLabel: string;
  }>) {
  const [reason, setReason] = useState<ReasonCode>();
  const [note, setNote] = useState('');
  const [capturing, setCapturing] = useState(false);
  const noteError =
    reason === 'other' && !note.trim()
      ? 'Add a note when the reason is Other.'
      : undefined;
  const disabled = submitting || capturing || !reason || Boolean(noteError);

  async function submit() {
    if (!reason || disabled) return;
    setCapturing(true);
    const coordinates = await captureOptionalLocation(
      captureLocationEvidence,
    );
    setCapturing(false);
    onSubmit(
      buildReasonRequest(
        { serviceDate, occurredAt, rows, coordinates },
        outcome,
        reason,
        note,
      ),
    );
  }

  return (
    <View>
      <AppText accessibilityRole="header" variant="h2">
        Select a reason
      </AppText>
      {choices.map((choice) => (
        <Button
          key={choice.code}
          label={choice.label}
          disabled={submitting || capturing}
          onPress={() => setReason(choice.code)}
        />
      ))}
      {reason ? (
        <AppText>
          Selected reason:{' '}
          {choices.find((choice) => choice.code === reason)?.label}
        </AppText>
      ) : null}
      <Field
        label="Note"
        value={note}
        error={noteError}
        maxLength={500}
        multiline
        onChangeText={setNote}
      />
      <Button
        label={capturing ? 'Capturing location…' : submitLabel}
        disabled={disabled}
        onPress={() => void submit()}
      />
    </View>
  );
}

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import {
  buildDeliveredRequest,
  validateQuantity,
  type DisplayOutcomeRow,
} from './forms';
import type { StopOutcomeRequest } from './types';

type Props = Readonly<{
  serviceDate: string;
  occurredAt: string;
  rows: readonly DisplayOutcomeRow[];
  submitting?: boolean;
  onSubmit: (request: StopOutcomeRequest) => void;
}>;

const QUANTITY_ERROR =
  'Enter a positive quantity with up to three decimal places.';

export function DeliveredOutcomeForm({
  serviceDate,
  occurredAt,
  rows,
  submitting = false,
  onSubmit,
}: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.plannedQuantity])),
  );
  const valid = useMemo(
    () =>
      rows.every(
        (row) => quantityError(quantities[row.id] ?? '') === undefined,
      ),
    [quantities, rows],
  );

  return (
    <View>
      <AppText accessibilityRole="header" variant="h2">
        Confirm delivered quantities
      </AppText>
      {rows.map((row) => {
        const value = quantities[row.id] ?? '';
        return (
          <Field
            key={row.id}
            label={`${row.productName} quantity in ${row.unitName}`}
            value={value}
            error={quantityError(value)}
            keyboardType="decimal-pad"
            onChangeText={(quantity) =>
              setQuantities((current) => ({ ...current, [row.id]: quantity }))
            }
          />
        );
      })}
      <Button
        label="Confirm delivered"
        disabled={submitting || !valid}
        onPress={() =>
          onSubmit(
            buildDeliveredRequest(
              serviceDate,
              occurredAt,
              rows.map((row) => ({
                ...row,
                actualQuantity: quantities[row.id] ?? '',
              })),
            ),
          )
        }
      />
    </View>
  );
}

function quantityError(value: string) {
  try {
    validateQuantity(value);
    return undefined;
  } catch {
    return QUANTITY_ERROR;
  }
}

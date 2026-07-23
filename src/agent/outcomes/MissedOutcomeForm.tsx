import {
  ReasonOutcomeForm,
  type ReasonOutcomeFormProps,
} from './SkipOutcomeForm';

const MISSED_CHOICES = [
  { code: 'address_not_found', label: 'Address not found' },
  { code: 'access_blocked', label: 'Access blocked' },
  { code: 'product_unavailable', label: 'Product unavailable' },
  { code: 'vehicle_or_route_issue', label: 'Vehicle or route issue' },
  { code: 'safety_issue', label: 'Safety issue' },
  { code: 'other', label: 'Other' },
] as const;

export function MissedOutcomeForm(props: ReasonOutcomeFormProps) {
  return (
    <ReasonOutcomeForm
      {...props}
      outcome="missed"
      choices={MISSED_CHOICES}
      submitLabel="Confirm missed"
    />
  );
}

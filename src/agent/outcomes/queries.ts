import { mutationOptions } from '@tanstack/react-query';
import { postStopOutcome, type StopOutcomeInput } from './api';
import type { StopOutcomeRequest } from './types';

export function stopOutcomeMutation(
  input: Omit<StopOutcomeInput, 'body'>,
) {
  return mutationOptions({
    mutationKey: ['agent', input.vendorId, 'stop-outcome', input.routeStopId],
    mutationFn: (body: StopOutcomeRequest) => postStopOutcome({ ...input, body }),
    retry: false,
  });
}

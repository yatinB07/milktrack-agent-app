import { useMutation } from '@tanstack/react-query';
import {
  StopOutcomeError,
  type StopOutcomeInput,
} from './api';
import { stopOutcomeMutation } from './queries';

export function useStopOutcome(input: Omit<StopOutcomeInput, 'body'>) {
  const mutation = useMutation(stopOutcomeMutation(input));
  const error = mutation.error instanceof StopOutcomeError
    ? mutation.error
    : undefined;

  return {
    submit: mutation.mutateAsync,
    pending: mutation.isPending,
    result: mutation.data,
    error,
    requiresAuthoritativeRefetch:
      error?.kind === 'ambiguous' || error?.kind === 'conflict',
    reset: mutation.reset,
  };
}

import { api } from './client';

export async function getHealth(signal?: AbortSignal) {
  const { data, error } = await api.GET('/v1/health', { signal });
  if (error || !data) throw new Error('MilkTrack service is unavailable');
  return data;
}

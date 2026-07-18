import { api } from '../client';
import { getHealth } from '../health';

jest.mock('../client', () => ({ api: { GET: jest.fn() } }));

const get = api.GET as jest.Mock;
const fixture = { status: 'ok', service: 'milktrack-backend', timestamp: '2026-07-18T10:00:00.000Z' } as const;

it('returns backend health using the caller signal', async () => {
  const signal = new AbortController().signal;
  get.mockResolvedValueOnce({ data: fixture });
  await expect(getHealth(signal)).resolves.toEqual(fixture);
  expect(get).toHaveBeenCalledWith('/v1/health', { signal });
});

it('maps backend errors to a field-safe service message', async () => {
  get.mockResolvedValueOnce({ error: { code: 'unavailable' } });
  await expect(getHealth()).rejects.toThrow('MilkTrack service is unavailable');
});

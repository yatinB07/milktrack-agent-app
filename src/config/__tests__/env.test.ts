import { getApiBaseUrl } from '../env';

it.each([['https://api.example.com/', 'https://api.example.com'], ['http://10.0.2.2:3000', 'http://10.0.2.2:3000']])('normalizes %s', (input, expected) => expect(getApiBaseUrl(input)).toBe(expected));
it.each([undefined, '/v1', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com/v1'])('rejects %s', (input) => expect(() => getApiBaseUrl(input)).toThrow('Invalid EXPO_PUBLIC_API_BASE_URL'));

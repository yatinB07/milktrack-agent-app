import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getApiBaseUrl } from '@/config/env';

export const api = createClient<paths>({
  baseUrl: getApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
});

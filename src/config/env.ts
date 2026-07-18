export function getApiBaseUrl(value?: string): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) throw new Error();
    return url.href.replace(/\/$/, '');
  } catch { throw new Error('Invalid EXPO_PUBLIC_API_BASE_URL'); }
}

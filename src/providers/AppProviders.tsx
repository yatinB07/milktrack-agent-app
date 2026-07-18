import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

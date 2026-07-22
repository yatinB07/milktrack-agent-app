import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { AgentWorkspaceProvider } from '@/agent/AgentWorkspaceProvider';
import { AuthProvider } from '@/auth/AuthProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
  return <QueryClientProvider client={queryClient}><AuthProvider><AgentWorkspaceProvider>{children}</AgentWorkspaceProvider></AuthProvider></QueryClientProvider>;
}

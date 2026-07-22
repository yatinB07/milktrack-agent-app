import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { clearActiveVendorId, loadActiveVendorId, saveActiveVendorId } from '@/auth/storage';

export type AgentVendor = Readonly<{ vendorId: string; vendorName: string }>;
type AgentWorkspaceStatus = 'loading' | 'ready' | 'selection-required' | 'access-unavailable';
type AgentWorkspaceValue = Readonly<{
  status: AgentWorkspaceStatus;
  vendors: readonly AgentVendor[];
  activeVendor?: AgentVendor;
  selectVendor(vendorId: string): Promise<void>;
  clearVendor(): Promise<void>;
}>;

const AgentWorkspaceContext = createContext<AgentWorkspaceValue | undefined>(undefined);

async function evictVendorQueries(queryClient: QueryClient, vendorId: string) {
  const queryKey = ['agent', vendorId] as const;
  await queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
}

export function AgentWorkspaceProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const vendors = useMemo(() => auth.actor?.memberships
    .filter(({ role, status }) => role === 'delivery_agent' && status === 'active')
    .map(({ vendorId, vendorName }) => ({ vendorId, vendorName })) ?? [], [auth.actor?.memberships]);
  const [status, setStatus] = useState<AgentWorkspaceStatus>('loading');
  const [activeVendor, setActiveVendor] = useState<AgentVendor>();
  const activeVendorIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (auth.status === 'loading') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (auth.status !== 'authenticated' || !auth.accessToken || vendors.length === 0) {
        const previousVendorId = activeVendorIdRef.current;
        activeVendorIdRef.current = undefined;
        setActiveVendor(undefined);
        setStatus('access-unavailable');
        if (previousVendorId) void (async () => {
          try {
            await evictVendorQueries(queryClient, previousVendorId);
            await clearActiveVendorId();
          } catch {}
        })();
        return;
      }
      setActiveVendor(undefined);
      setStatus('loading');
      void (async () => {
        const storedVendorId = await loadActiveVendorId();
        if (cancelled) return;
        if (vendors.length === 1) {
          const vendor = vendors[0]!;
          if (storedVendorId !== vendor.vendorId) {
            if (storedVendorId) await evictVendorQueries(queryClient, storedVendorId);
            if (cancelled) return;
            await saveActiveVendorId(vendor.vendorId);
          }
          if (!cancelled) {
            activeVendorIdRef.current = vendor.vendorId;
            setActiveVendor(vendor);
            setStatus('ready');
          }
          return;
        }
        const storedVendor = vendors.find(({ vendorId }) => vendorId === storedVendorId);
        if (storedVendor) {
          activeVendorIdRef.current = storedVendor.vendorId;
          setActiveVendor(storedVendor);
          setStatus('ready');
          return;
        }
        if (storedVendorId) {
          await evictVendorQueries(queryClient, storedVendorId);
          await clearActiveVendorId();
          if (cancelled) return;
        }
        setStatus('selection-required');
      })();
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [auth.accessToken, auth.status, queryClient, vendors]);

  const selectVendor = useCallback(async (vendorId: string) => {
    const vendor = vendors.find((candidate) => candidate.vendorId === vendorId);
    if (!vendor) throw new Error('Vendor is not an active delivery-agent workspace');
    if (activeVendor?.vendorId === vendorId) return;
    const previousVendorId = activeVendor?.vendorId;
    activeVendorIdRef.current = undefined;
    setActiveVendor(undefined);
    setStatus('loading');
    try {
      if (previousVendorId) await evictVendorQueries(queryClient, previousVendorId);
      await saveActiveVendorId(vendorId);
      activeVendorIdRef.current = vendor.vendorId;
      setActiveVendor(vendor);
      setStatus('ready');
    } catch (cause) {
      setStatus('selection-required');
      throw cause;
    }
  }, [activeVendor?.vendorId, queryClient, vendors]);
  const clearVendor = useCallback(async () => {
    const previousVendorId = activeVendor?.vendorId;
    activeVendorIdRef.current = undefined;
    setActiveVendor(undefined);
    setStatus('loading');
    try {
      if (previousVendorId) await evictVendorQueries(queryClient, previousVendorId);
      await clearActiveVendorId();
      setStatus('selection-required');
    } catch (cause) {
      setStatus('selection-required');
      throw cause;
    }
  }, [activeVendor?.vendorId, queryClient]);

  return <AgentWorkspaceContext.Provider value={{ status, vendors, activeVendor, selectVendor, clearVendor }}>{children}</AgentWorkspaceContext.Provider>;
}

export function useAgentWorkspace(): AgentWorkspaceValue {
  const value = useContext(AgentWorkspaceContext);
  if (!value) throw new Error('useAgentWorkspace must be used inside AgentWorkspaceProvider');
  return value;
}

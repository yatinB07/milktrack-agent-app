import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Button, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import * as storage from '@/auth/storage';
import { AgentWorkspaceProvider, useAgentWorkspace } from '../AgentWorkspaceProvider';

jest.mock('@/auth/AuthProvider');
jest.mock('@/auth/storage');

const memberships = [
  { id: 'agent-a', vendorId: 'vendor-a', vendorName: 'Vendor A', role: 'delivery_agent', status: 'active' },
  { id: 'inactive', vendorId: 'vendor-b', vendorName: 'Vendor B', role: 'delivery_agent', status: 'inactive' },
  { id: 'customer', vendorId: 'vendor-c', vendorName: 'Vendor C', role: 'customer', status: 'active' },
];

function Probe() {
  const workspace = useAgentWorkspace();
  return <View>
    <Text>{workspace.status}</Text>
    <Text>{workspace.vendors.map(({ vendorName }) => vendorName).join(',')}</Text>
    <Text>{workspace.activeVendor?.vendorName}</Text>
    <Button title="select-vendor-b" onPress={() => void workspace.selectVendor('vendor-b')} />
    <Button title="clear-vendor" onPress={() => void workspace.clearVendor()} />
  </View>;
}

function renderWorkspace(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={queryClient}><AgentWorkspaceProvider><Probe /></AgentWorkspaceProvider></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue({ status: 'authenticated', accessToken: 'access', actor: { memberships } } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue(null);
});

it('filters active delivery-agent memberships and auto-selects the sole vendor', async () => {
  const view = await renderWorkspace();

  await view.findByText('ready');
  expect(view.getAllByText('Vendor A')).toHaveLength(2);
  expect(view.queryByText('Vendor B')).toBeNull();
  expect(view.queryByText('Vendor C')).toBeNull();
  expect(storage.saveActiveVendorId).toHaveBeenCalledWith('vendor-a');
});

it('restores a stored vendor only when it remains an active agent membership', async () => {
  const secondMembership = { ...memberships[0]!, id: 'agent-b', vendorId: 'vendor-b', vendorName: 'Vendor B' };
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access',
    actor: { memberships: [memberships[0], secondMembership] },
  } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('vendor-b');

  const view = await renderWorkspace();

  await view.findByText('ready');
  expect(view.getByText('Vendor A,Vendor B')).toBeTruthy();
  expect(view.getByText('Vendor B')).toBeTruthy();
  expect(storage.saveActiveVendorId).not.toHaveBeenCalled();
});

it('evicts a stale stored vendor before clearing persistence and requiring selection', async () => {
  const secondMembership = { ...memberships[0]!, id: 'agent-b', vendorId: 'vendor-b', vendorName: 'Vendor B' };
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access',
    actor: { memberships: [memberships[0], secondMembership] },
  } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('stale-vendor');
  const order: string[] = [];
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, 'cancelQueries').mockImplementation(async (filters) => {
    expect(filters?.queryKey).toEqual(['agent', 'stale-vendor']);
    order.push('cancel');
  });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation((filters) => {
    expect(filters?.queryKey).toEqual(['agent', 'stale-vendor']);
    order.push('remove');
  });
  jest.mocked(storage.clearActiveVendorId).mockImplementation(async () => { order.push('clear'); });

  const view = await renderWorkspace(queryClient);

  await view.findByText('selection-required');
  expect(order).toEqual(['cancel', 'remove', 'clear']);
  expect(view.queryByText('stale-vendor')).toBeNull();
});

it('hides stale vendor content and evicts old queries before persisting a switch', async () => {
  const secondMembership = { ...memberships[0]!, id: 'agent-b', vendorId: 'vendor-b', vendorName: 'Vendor B' };
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access',
    actor: { memberships: [memberships[0], secondMembership] },
  } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('vendor-a');
  const order: string[] = [];
  let finishCancellation!: () => void;
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, 'cancelQueries').mockImplementation((filters) => {
    expect(filters?.queryKey).toEqual(['agent', 'vendor-a']);
    order.push('cancel');
    return new Promise((resolve) => { finishCancellation = resolve; });
  });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation(() => { order.push('remove'); });
  jest.mocked(storage.saveActiveVendorId).mockImplementation(async () => { order.push('save'); });
  const view = await renderWorkspace(queryClient);
  await view.findByText('ready');

  await fireEvent.press(view.getByRole('button', { name: 'select-vendor-b' }));

  expect(view.getByText('loading')).toBeTruthy();
  expect(view.queryByText('Vendor A')).toBeNull();
  expect(order).toEqual(['cancel']);
  finishCancellation();
  await view.findByText('ready');
  expect(view.getByText('Vendor B')).toBeTruthy();
  expect(order).toEqual(['cancel', 'remove', 'save']);
});

it('evicts the active vendor before clearing the selection', async () => {
  const secondMembership = { ...memberships[0]!, id: 'agent-b', vendorId: 'vendor-b', vendorName: 'Vendor B' };
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access',
    actor: { memberships: [memberships[0], secondMembership] },
  } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('vendor-a');
  const order: string[] = [];
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => { order.push('cancel'); });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation(() => { order.push('remove'); });
  jest.mocked(storage.clearActiveVendorId).mockImplementation(async () => { order.push('clear'); });
  const view = await renderWorkspace(queryClient);
  await view.findByText('ready');

  await fireEvent.press(view.getByRole('button', { name: 'clear-vendor' }));

  await view.findByText('selection-required');
  expect(view.queryByText('Vendor A')).toBeNull();
  expect(order).toEqual(['cancel', 'remove', 'clear']);
});

it('evicts a stale stored vendor before auto-persisting a sole replacement', async () => {
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('stale-vendor');
  const order: string[] = [];
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => { order.push('cancel'); });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation(() => { order.push('remove'); });
  jest.mocked(storage.saveActiveVendorId).mockImplementation(async () => { order.push('save'); });

  const view = await renderWorkspace(queryClient);

  await view.findByText('ready');
  expect(order).toEqual(['cancel', 'remove', 'save']);
});

it('evicts active vendor data when authentication becomes unavailable', async () => {
  const secondMembership = { ...memberships[0]!, id: 'agent-b', vendorId: 'vendor-b', vendorName: 'Vendor B' };
  jest.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    accessToken: 'access',
    actor: { memberships: [memberships[0], secondMembership] },
  } as ReturnType<typeof useAuth>);
  jest.mocked(storage.loadActiveVendorId).mockResolvedValue('vendor-a');
  const order: string[] = [];
  const queryClient = new QueryClient();
  jest.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => { order.push('cancel'); });
  jest.spyOn(queryClient, 'removeQueries').mockImplementation(() => { order.push('remove'); });
  jest.mocked(storage.clearActiveVendorId).mockImplementation(async () => { order.push('clear'); });
  const view = await render(<QueryClientProvider client={queryClient}><AgentWorkspaceProvider><Probe /></AgentWorkspaceProvider></QueryClientProvider>);
  await view.findByText('ready');

  jest.mocked(useAuth).mockReturnValue({ status: 'anonymous' } as ReturnType<typeof useAuth>);
  await view.rerender(<QueryClientProvider client={queryClient}><AgentWorkspaceProvider><Probe /></AgentWorkspaceProvider></QueryClientProvider>);

  await view.findByText('access-unavailable');
  expect(view.queryByText('Vendor A')).toBeNull();
  await waitFor(() => expect(order).toEqual(['cancel', 'remove', 'clear']));
});

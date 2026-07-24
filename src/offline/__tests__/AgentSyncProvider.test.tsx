import { render } from '@testing-library/react-native';
import { Component, type ReactNode } from 'react';
import { Text } from 'react-native';

import { useAgentSync } from '../AgentSyncProvider';

describe('agent synchronization view contract', () => {
  test('fails closed outside the authenticated synchronization provider', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation();
    try {
      const view = await render(
        <TestErrorBoundary>
          <MissingProviderProbe />
        </TestErrorBoundary>,
      );

      expect(
        view.getByText('Agent synchronization provider is unavailable'),
      ).toBeTruthy();
    } finally {
      errorLog.mockRestore();
    }
  });
});

function MissingProviderProbe() {
  useAgentSync();
  return <Text>Unexpected synchronization access</Text>;
}

class TestErrorBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  Readonly<{ message?: string }>
> {
  state: Readonly<{ message?: string }> = {};

  static getDerivedStateFromError(error: unknown) {
    return {
      message:
        error instanceof Error ? error.message : 'Unknown synchronization error',
    };
  }

  render() {
    if (this.state.message) {
      return <Text>{this.state.message}</Text>;
    }
    return this.props.children;
  }
}

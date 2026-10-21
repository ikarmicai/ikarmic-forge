import React from 'react';
import InkSpinner from 'ink-spinner';
import { Text } from 'ink';

export function Spinner(): React.ReactElement {
  return (
    <Text color="cyan">
      <InkSpinner type="dots" />
    </Text>
  );
}

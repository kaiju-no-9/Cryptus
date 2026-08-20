import React from 'react';
import { Text } from 'ink';
import type { MessageStatus } from '../../storage/dao/messages.js';

interface StatusBadgeProps {
  status: MessageStatus;
  direction: 'outgoing' | 'incoming';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, direction }) => {
  if (direction === 'incoming') {
    return <Text color="#808080">←</Text>;
  }

  switch (status) {
    case 'pending':
      return <Text color="#eab308">•</Text>;
    case 'sent':
      return <Text color="#808080">✓</Text>;
    case 'delivered':
      return <Text color="#22c55e">✓</Text>;
    case 'read':
      return <Text color="#22c55e">✓✓</Text>;
    case 'failed':
      return <Text color="#ef4444">✗</Text>;
    default:
      return <Text color="#808080">•</Text>;
  }
};

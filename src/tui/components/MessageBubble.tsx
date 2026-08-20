import React from 'react';
import { Box, Text } from 'ink';
import { StatusBadge } from './StatusBadge.js';
import type { Message } from '../../storage/index.js';

interface MessageBubbleProps {
  message: Message;
  senderName: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, senderName }) => {
  const isOutgoing = message.direction === 'outgoing';
  const timeStr = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between" width="100%">
        <Box>
          <Text color="#555555">│ </Text>
          <Text bold color={isOutgoing ? "#e0e0e0" : "#808080"}>
            {isOutgoing ? 'You' : senderName}
          </Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{timeStr}</Text>
          <StatusBadge status={message.status} direction={message.direction} />
        </Box>
      </Box>

      <Box paddingLeft={2}>
        <Text color="#e0e0e0">{message.plaintext ?? '[encrypted message]'}</Text>
      </Box>
    </Box>
  );
};

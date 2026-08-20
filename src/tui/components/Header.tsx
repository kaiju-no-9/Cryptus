import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  peerId?: string;
  viewName: string;
}

export const Header: React.FC<HeaderProps> = ({ peerId, viewName }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between">
        <Text bold>
          CRYPTUS <Text dimColor>// P2P Encrypted Chat</Text>
        </Text>
        <Text color="#808080">[{viewName.toUpperCase()}]</Text>
      </Box>
      {peerId && (
        <Box marginTop={0}>
          <Text dimColor>Peer ID: </Text>
          <Text color="#808080">{peerId.substring(0, 24)}…</Text>
        </Box>
      )}
    </Box>
  );
};

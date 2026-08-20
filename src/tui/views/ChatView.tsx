import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { MessageBubble } from '../components/MessageBubble.js';
import type { Contact, Message } from '../../storage/index.js';

interface ChatViewProps {
  contact: Contact;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onBack: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  contact,
  messages,
  onSendMessage,
  onBack,
}) => {
  const [inputText, setInputText] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    onSendMessage(value.trim());
    setInputText('');
  };

  const name = contact.displayName ?? contact.peerId.substring(0, 16);
  const statusBadge = contact.fingerprintVerified ? '[V] Verified' : '[U] Unverified';

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {/* Top Session Header */}
      <Box justifyContent="space-between" borderStyle="round" borderColor="#555555" paddingX={1}>
        <Text bold>
          Session with <Text color="#e0e0e0">{name}</Text>
        </Text>
        <Text color={contact.fingerprintVerified ? "#22c55e" : "#eab308"}>{statusBadge}</Text>
      </Box>

      {/* Messages Feed */}
      <Box flexDirection="column" marginY={1} flexGrow={1}>
        {messages.length === 0 ? (
          <Box marginY={1}>
            <Text dimColor>No message history. Send a message below to start.</Text>
          </Box>
        ) : (
          messages.slice(-10).map((msg) => (
            <MessageBubble key={msg.id} message={msg} senderName={name} />
          ))
        )}
      </Box>

      {/* Input Bar */}
      <Box borderStyle="round" borderColor="#555555" paddingX={1}>
        <Text bold color="#808080">
          {'$ '}
        </Text>
        <TextInput
          value={inputText}
          onChange={setInputText}
          onSubmit={handleSubmit}
          placeholder="Type message... (Press Enter to send, Esc to return)"
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[Enter] Send • [Esc] Back to contacts list</Text>
      </Box>
    </Box>
  );
};

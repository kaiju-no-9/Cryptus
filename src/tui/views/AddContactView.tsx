import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { Storage } from '../../storage/index.js';
import { decodeInvite } from '../../network/discovery/invite.js';

interface AddContactViewProps {
  onContactAdded: () => void;
  onBack: () => void;
}

export const AddContactView: React.FC<AddContactViewProps> = ({
  onContactAdded,
  onBack,
}) => {
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [activeField, setActiveField] = useState<'name' | 'code'>('name');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    }
    if (key.tab) {
      setActiveField((prev) => (prev === 'name' ? 'code' : 'name'));
    }
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }
    if (!inviteCode.trim()) {
      setError('Invite code is required.');
      setActiveField('code');
      return;
    }

    let invite;
    try {
      invite = decodeInvite(inviteCode.trim());
    } catch (err) {
      setError(`Invalid invite code: ${(err as Error).message}`);
      return;
    }

    const storage = Storage.open();
    const existing = storage.contacts.get(invite.peerId);

    if (existing) {
      setError(`Contact with this peer ID already exists.`);
      return;
    }

    const pubKey = invite.publicKey ?? new Uint8Array(32);
    storage.contacts.add({
      peerId: invite.peerId,
      displayName: name.trim(),
      publicKey: pubKey,
      addedAt: Date.now(),
      lastSeenAddr: invite.addrs[0] ?? null,
    });

    setError('');
    setSuccess(`✓ Added contact "${name.trim()}"`);
    setTimeout(() => {
      onContactAdded();
    }, 1500);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          Add New Contact
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="#ef4444">✗ {error}</Text>
        </Box>
      )}

      {success && (
        <Box marginBottom={1}>
          <Text color="#22c55e">{success}</Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text dimColor>Contact Name: </Text>
        {activeField === 'name' ? (
          <TextInput
            value={name}
            onChange={setName}
            placeholder="alice"
          />
        ) : (
          <Text color="#808080">{name || '(empty)'}</Text>
        )}
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Invite Code:  </Text>
        {activeField === 'code' ? (
          <TextInput
            value={inviteCode}
            onChange={setInviteCode}
            onSubmit={handleSubmit}
            placeholder="chat1..."
          />
        ) : (
          <Text color="#808080">{inviteCode ? inviteCode.substring(0, 30) + '…' : '(empty)'}</Text>
        )}
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="#555555" paddingX={1}>
        <Text dimColor>
          [Tab] Switch field • [Enter] Add contact • [Esc] Cancel
        </Text>
      </Box>
    </Box>
  );
};

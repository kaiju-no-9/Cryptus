import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Contact } from '../../storage/index.js';

interface ContactListViewProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  onVerifyContact: (contact: Contact) => void;
  onAddContact: () => void;
}

export const ContactListView: React.FC<ContactListViewProps> = ({
  contacts,
  onSelectContact,
  onVerifyContact,
  onAddContact,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex >= contacts.length && contacts.length > 0) {
      setSelectedIndex(contacts.length - 1);
    }
  }, [contacts.length, selectedIndex]);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : contacts.length - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < contacts.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      if (contacts[selectedIndex]) {
        onSelectContact(contacts[selectedIndex]);
      }
    }
    if (input === 'v' || input === 'V') {
      if (contacts[selectedIndex]) {
        onVerifyContact(contacts[selectedIndex]);
      }
    }
    if (input === 'a' || input === 'A') {
      onAddContact();
    }
  });

  if (contacts.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="#eab308">No contacts added yet.</Text>
        <Box marginTop={1}>
          <Text dimColor>
            Press <Text bold color="#22c55e">a</Text> to add a new contact with an invite code.
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>
          Contacts <Text dimColor>({contacts.length})</Text>
        </Text>
      </Box>

      {contacts.map((contact, index) => {
        const isSelected = index === selectedIndex;
        const name = contact.displayName ?? contact.peerId.substring(0, 16);
        const verifiedTag = contact.fingerprintVerified ? '[V] Verified' : '[U] Unverified';

        return (
          <Box
            key={contact.peerId}
            paddingX={1}
            justifyContent="space-between"
          >
            <Box>
              <Text color={isSelected ? "#22c55e" : "#555555"}>
                {isSelected ? '▌ ' : '  '}
              </Text>
              <Text bold={isSelected} color={isSelected ? "#e0e0e0" : "#808080"}>
                {name} <Text dimColor>({contact.peerId.substring(0, 12)}…)</Text>
              </Text>
            </Box>
            <Text color={contact.fingerprintVerified ? "#22c55e" : "#eab308"}>
              {verifiedTag}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={2} borderStyle="round" borderColor="#555555" paddingX={1}>
        <Text dimColor>
          [↑/↓] Navigate • [Enter] Chat • [v] Verify • [c] Copy Peer ID • [a] Add Contact
        </Text>
      </Box>
    </Box>
  );
};

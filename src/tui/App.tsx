import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Header } from './components/Header.js';
import { ContactListView } from './views/ContactListView.js';
import { ChatView } from './views/ChatView.js';
import { VerifyView } from './views/VerifyView.js';
import { AddContactView } from './views/AddContactView.js';
import { Storage, type Contact, type Message } from '../storage/index.js';
import { loadIdentity } from '../identity/index.js';
import { OutboxManager } from '../outbox/index.js';
import { copyToClipboard } from './utils/clipboard.js';

type ViewMode = 'contacts' | 'chat' | 'verify' | 'addContact';

export const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [localPeerId, setLocalPeerId] = useState<string>('');
  const [localPublicKey, setLocalPublicKey] = useState<Uint8Array | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Load identity and contacts on startup
  useEffect(() => {
    async function init() {
      try {
        const ident = await loadIdentity();
        setLocalPeerId(ident.peerId);
        setLocalPublicKey(ident.publicKey);

        const storage = Storage.open();
        setContacts(storage.contacts.list());
      } catch {
        setStatusMsg('Identity not found. Run `chat init` first.');
      }
    }
    void init();
  }, []);

  // Poll messages when in chat view
  useEffect(() => {
    if (view !== 'chat' || !selectedContact) return;

    const storage = Storage.open();
    const interval = setInterval(() => {
      const msgs = storage.messages.getByPeer(selectedContact.peerId, 50).reverse();
      setMessages(msgs);
    }, 500);

    return () => clearInterval(interval);
  }, [view, selectedContact]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    const storage = Storage.open();
    const msgs = storage.messages.getByPeer(contact.peerId, 50).reverse();
    setMessages(msgs);
    setView('chat');
  };

  const handleVerifyContact = (contact: Contact) => {
    setSelectedContact(contact);
    setView('verify');
  };

  const handleSendMessage = (text: string) => {
    if (!selectedContact) return;
    const outbox = OutboxManager.getInstance();
    outbox.enqueue(selectedContact.peerId, localPeerId, text);

    const storage = Storage.open();
    const msgs = storage.messages.getByPeer(selectedContact.peerId, 50).reverse();
    setMessages(msgs);
  };

  const handleConfirmVerify = () => {
    if (!selectedContact) return;
    const storage = Storage.open();
    storage.contacts.markVerified(selectedContact.peerId);
    setContacts(storage.contacts.list());
    setStatusMsg(`[✓] Verified ${selectedContact.displayName}`);
    setView('contacts');
  };

  useInput((input) => {
    if (view === 'contacts' && (input === 'c' || input === 'C') && localPeerId) {
      const ok = copyToClipboard(localPeerId);
      setStatusMsg(ok ? '[✓] Peer ID copied to clipboard' : '[✗] Failed to copy');
    }
  });

  useEffect(() => {
    if (!statusMsg) return;
    const timer = setTimeout(() => setStatusMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [statusMsg]);

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Header peerId={localPeerId} viewName={view} />

      {statusMsg && (
        <Box borderStyle="round" borderColor="#555555" paddingX={1} marginBottom={1}>
          <Text color="#eab308">{statusMsg}</Text>
        </Box>
      )}

      {view === 'contacts' && (
        <ContactListView
          contacts={contacts}
          onSelectContact={handleSelectContact}
          onVerifyContact={handleVerifyContact}
          onAddContact={() => setView('addContact')}
        />
      )}

      {view === 'chat' && selectedContact && (
        <ChatView
          contact={selectedContact}
          messages={messages}
          onSendMessage={handleSendMessage}
          onBack={() => setView('contacts')}
        />
      )}

      {view === 'verify' && selectedContact && localPublicKey && (
        <VerifyView
          contact={selectedContact}
          localPublicKey={localPublicKey}
          onConfirmVerify={handleConfirmVerify}
          onBack={() => setView('contacts')}
        />
      )}

      {view === 'addContact' && (
        <AddContactView
          onContactAdded={() => {
            const storage = Storage.open();
            setContacts(storage.contacts.list());
            setStatusMsg('[✓] Contact added successfully!');
            setView('contacts');
          }}
          onBack={() => setView('contacts')}
        />
      )}
    </Box>
  );
};

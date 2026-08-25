import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { computeFingerprint, formatFingerprintDisplay } from '../../crypto/index.js';
import type { Contact } from '../../storage/index.js';
import { copyToClipboard } from '../utils/clipboard.js';

interface VerifyViewProps {
  contact: Contact;
  localPublicKey: Uint8Array;
  onConfirmVerify: () => void;
  onBack: () => void;
}

export const VerifyView: React.FC<VerifyViewProps> = ({
  contact,
  localPublicKey,
  onConfirmVerify,
  onBack,
}) => {
  const fingerprint = computeFingerprint(localPublicKey, contact.publicKey);
  const formatted = formatFingerprintDisplay(fingerprint);
  const name = contact.displayName ?? contact.peerId.substring(0, 16);
  const [copied, setCopied] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
    if (input === 'y' || input === 'Y') {
      onConfirmVerify();
    }
    if (input === 'n' || input === 'N') {
      onBack();
    }
    if (input === 'c' || input === 'C') {
      const ok = copyToClipboard(fingerprint);
      setCopied(ok);
      setTimeout(() => setCopied(false), 2000);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#555555" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          Safety Number Verification <Text dimColor>({name})</Text>
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Compare this 60-digit Safety Number with the number on {name}{"'"}s device:
        </Text>
      </Box>

      <Box borderStyle="single" borderColor="#555555" padding={1} marginY={1}>
        <Text bold color="#e0e0e0">
          {formatted}
        </Text>
      </Box>

      {copied && (
        <Box>
          <Text color="#22c55e">✓ Safety Number copied to clipboard</Text>
        </Box>
      )}

      <Box marginY={1}>
        <Text bold color={contact.fingerprintVerified ? "#22c55e" : "#eab308"}>
          {contact.fingerprintVerified ? '[V] Status: Verified' : '[U] Status: Unverified'}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>
          Does this match {name}{"'"}s device? <Text color="#22c55e">[Y]es</Text>  <Text color="#3b82f6">[C]opy</Text>  <Text color="#ef4444">[N]o / Esc</Text>
        </Text>
      </Box>
    </Box>
  );
};

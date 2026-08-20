export type FrameType = 'chat' | 'ack';

export interface ChatWireFrame {
  type?: 'chat';
  id: string;
  from: string;
  text: string;
  timestamp: number;
}

export interface ACKWireFrame {
  type: 'ack';
  messageId: string;
  from: string;
  timestamp: number;
}

export type WireFrame = ChatWireFrame | ACKWireFrame;

/** Encodes a wire frame to newline-delimited UTF-8 bytes. */
export function encodeFrame(frame: WireFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(frame) + '\n');
}

/** Decodes a JSON string line into a WireFrame. Throws if invalid JSON. */
export function decodeFrame(line: string): WireFrame {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  if (parsed['type'] === 'ack') {
    return {
      type: 'ack',
      messageId: (parsed['messageId'] as string) ?? '',
      from: (parsed['from'] as string) ?? '',
      timestamp: (parsed['timestamp'] as number) ?? Date.now(),
    };
  }
  return {
    type: 'chat',
    id: (parsed['id'] as string) ?? '',
    from: (parsed['from'] as string) ?? '',
    text: (parsed['text'] as string) ?? '',
    timestamp: (parsed['timestamp'] as number) ?? Date.now(),
  };
}

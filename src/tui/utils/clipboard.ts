import { execSync } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Copies text to the system clipboard.
 * Supports macOS (pbcopy), Linux (xclip/xsel), and Windows (clip.exe).
 * Returns true if successful, false on failure.
 */
export function copyToClipboard(text: string): boolean {
  try {
    const os = platform();
    if (os === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (os === 'win32') {
      execSync('clip', { input: text });
    } else {
      // Linux — try xclip first, then xsel
      try {
        execSync('xclip -selection clipboard', { input: text });
      } catch {
        execSync('xsel --clipboard --input', { input: text });
      }
    }
    return true;
  } catch {
    return false;
  }
}

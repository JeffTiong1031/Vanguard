import type { SurfaceAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
export function pickAdapter(hostname: string): SurfaceAdapter | null {
  if (hostname.endsWith('chatgpt.com')) return chatgptAdapter;
  if (hostname.endsWith('claude.ai')) return claudeAdapter;
  return null;
}

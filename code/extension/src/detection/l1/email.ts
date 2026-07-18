import type { Finding } from './types';
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
export function detectEmail(text: string): Finding[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => ({ cls: 'EMAIL', start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}

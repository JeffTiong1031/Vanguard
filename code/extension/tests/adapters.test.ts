import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../src/adapters/registry';
import { chatgptAdapter } from '../src/adapters/chatgpt';
import { claudeAdapter } from '../src/adapters/claude';

describe('adapter registry', () => {
  it('routes chatgpt.com', () => expect(pickAdapter('chatgpt.com')?.host).toBe('chatgpt.com'));
  it('routes claude.ai', () => expect(pickAdapter('claude.ai')?.host).toBe('claude.ai'));
  it('returns null off-surface', () => expect(pickAdapter('example.com')).toBeNull());
});

describe('adapter shape', () => {
  const methods = ['getComposer', 'readText', 'writeText', 'isSendControl', 'onPaste'] as const;

  it('chatgptAdapter exposes the expected host and methods', () => {
    expect(chatgptAdapter.host).toBe('chatgpt.com');
    for (const m of methods) {
      expect(typeof chatgptAdapter[m]).toBe('function');
    }
  });

  it('claudeAdapter exposes the expected host and methods', () => {
    expect(claudeAdapter.host).toBe('claude.ai');
    for (const m of methods) {
      expect(typeof claudeAdapter[m]).toBe('function');
    }
  });
});

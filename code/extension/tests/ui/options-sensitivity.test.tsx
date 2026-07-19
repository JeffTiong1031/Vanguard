// @vitest-environment jsdom
// tests/ui/options-sensitivity.test.tsx
//
// The panel exists because the feature had no observable state: seven distinct failure causes
// all produced identical behaviour, and the only output was a console.debug in a lazily-created
// document. These tests assert the state is actually rendered, in words, for each branch.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { SensitivityPanel } from '../../src/ui/sensitivity-panel';

const stubStorage = (data: Record<string, unknown>) => {
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => data, set: async () => {} } },
  });
};

describe('SensitivityPanel', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows a ready engine with its counts', async () => {
    stubStorage({
      vg_sensitivity_model_id: 'vanguard/sens-v0.2.0-trim70k',
      vg_sensitivity_last_status: {
        state: 'ready', spans: 3, released: 2, kept: 1, failed: 0, ms: 210,
      },
    });
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Ready — 3 spans in 210 ms, 2 released, 1 masked/)).toBeTruthy();
  });

  it('says so when no model is configured, rather than looking identical to working', async () => {
    stubStorage({});
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Off — no model configured/)).toBeTruthy();
  });

  it('surfaces a real failure reason instead of degrading silently (ADR 0014)', async () => {
    stubStorage({
      vg_sensitivity_model_id: 'vanguard/sens',
      vg_sensitivity_last_status: { state: 'failed', reason: 'model load timed out after 60000 ms' },
    });
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Failed — model load timed out after 60000 ms/)).toBeTruthy();
  });

  it('distinguishes a skipped scan from a disabled engine', async () => {
    stubStorage({
      vg_sensitivity_model_id: 'vanguard/sens',
      vg_sensitivity_last_status: { state: 'skipped', why: 'too-long' },
    });
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Skipped — prompt too long for the classifier/)).toBeTruthy();
  });

  it('does not crash when loadConfig throws (no chrome.storage at all)', async () => {
    vi.stubGlobal('chrome', {});
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Sensitivity classifier/)).toBeTruthy();
  });
});

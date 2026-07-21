/**
 * Plain-language explanations for every enforcement decision the employee sees.
 *
 * This is the transparency half of case-study 3b: name WHY a decision was made,
 * and make clear a machine decided it on-device (AI was involved, no human read
 * the prompt). Wording ships here in the extension (Approach A) -- changing it
 * means a rebuild, which is fine.
 */
export type ExplainKind = 'ethics' | 'pii' | 'tool';
export type Explanation = { title: string; why: string; note: string };

/** Shared across every entry -- the "AI was involved + on-device" disclosure. */
const NOTE = 'Decided automatically on your device by Vanguard’s classifier — no person read your prompt.';

const ETHICS: Record<string, Explanation> = {
  covert_surveillance: { title: 'Covert monitoring', why: 'This asks how to monitor or track people without their knowledge, which your organisation does not permit AI to be used for.', note: NOTE },
  discriminatory_screening: { title: 'Discriminatory screening', why: 'This asks to screen, rank, or filter people using traits that would be unfair or unlawful to decide on.', note: NOTE },
  harassment_content: { title: 'Harassing content', why: 'This asks to produce content that would harass, threaten, or demean a person.', note: NOTE },
  regulatory_circumvention: { title: 'Evading obligations', why: 'This asks for help avoiding a legal, safety, or regulatory obligation.', note: NOTE },
  security_evasion: { title: 'Security evasion', why: 'This asks how to defeat a security control or produce code intended to exploit one.', note: NOTE },
  undisclosed_profiling: { title: 'Undisclosed profiling', why: 'This asks to profile or infer sensitive facts about a person without their knowledge.', note: NOTE },
};

const PII: Record<string, Explanation> = {
  NRIC: { title: 'Malaysian IC number', why: 'This looks like a Malaysian identity-card number, so it was masked before it could reach the AI provider.', note: NOTE },
  SSM: { title: 'Company registration number', why: 'This looks like an SSM company-registration number and was masked.', note: NOTE },
  TIN: { title: 'Tax number', why: 'This looks like a tax identification number and was masked.', note: NOTE },
  EMAIL: { title: 'Email address', why: 'This is an email address and was masked before reaching the AI provider.', note: NOTE },
  CARD: { title: 'Payment-card number', why: 'This looks like a payment-card number and was masked.', note: NOTE },
  PERSON: { title: 'Personal name', why: 'This looks like a person’s name and was masked to keep it from the AI provider.', note: NOTE },
  ORG: { title: 'Organisation name', why: 'This looks like a company or organisation name and was masked.', note: NOTE },
};

const TOOL: Explanation = {
  title: 'Tool not approved',
  why: 'This AI tool has not been reviewed by your organisation for how it handles company data, so it is not on the approved list yet.',
  note: 'This is a policy decision. You can ask your admin to review and approve it.',
};

const GENERIC: Explanation = {
  title: 'Automated decision',
  why: 'Vanguard’s classifier flagged this against your organisation’s policy.',
  note: NOTE,
};

export function explain(kind: ExplainKind, key: string): Explanation {
  if (kind === 'tool') return TOOL;
  const table = kind === 'ethics' ? ETHICS : PII;
  return table[key] ?? GENERIC;
}

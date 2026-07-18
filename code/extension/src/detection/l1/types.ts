export type FindingClass =
  | 'NRIC' | 'SSM' | 'NRIC_OR_SSM_AMBIGUOUS' | 'TIN' | 'EMAIL' | 'CARD' | 'PERSON' | 'ORG';
export type Finding = { cls: FindingClass; start: number; end: number; text: string };

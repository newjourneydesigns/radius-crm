export const QUESTION_RESPONSE_KEYS = [
  'dynamic',
  'did_not_meet_reason',
  'did_not_meet_notes',
] as const;

export type QuestionResponseKey = (typeof QUESTION_RESPONSE_KEYS)[number];

export const DID_NOT_MEET_REASON_KEY = 'did_not_meet_reason';
export const DID_NOT_MEET_NOTES_KEY = 'did_not_meet_notes';
export const DYNAMIC_RESPONSE_KEY = 'dynamic';

export const DID_NOT_MEET_OTHER_VALUE = '__other__';

export function normalizeQuestionResponseKey(value: unknown): QuestionResponseKey {
  return QUESTION_RESPONSE_KEYS.includes(value as QuestionResponseKey)
    ? (value as QuestionResponseKey)
    : DYNAMIC_RESPONSE_KEY;
}

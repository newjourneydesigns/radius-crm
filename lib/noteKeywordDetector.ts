export type NoteInsight = 'prayer' | 'development';

export interface NoteDetectionResult {
  insights: NoteInsight[];
  matchedPhrases: Partial<Record<NoteInsight, string>>;
}

const PRAYER_PATTERNS = [
  /\bpray(?:ing|ed|er|ers|s)?\b/i,
  /\bintercede(?:d|s)?\b/i,
  /\bintercession\b/i,
  /\blift(?:ing)? (?:up|them|him|her)\b/i,
  /\bhealing\b/i,
  /\bhealed?\b/i,
];

const DEVELOPMENT_PATTERNS = [
  /\bdevelop(?:ing|ed|ment|s)?\b/i,
  /\bapprentic(?:e|es|ing)\b/i,
  /\bmentor(?:ing|ed|s)?\b/i,
  /\brais(?:e|ing) up\b/i,
  /\bnext leader\b/i,
  /\bfuture leader\b/i,
  /\bpotential leader\b/i,
  /\bmultiplication\b/i,
  /\bmultiply(?:ing)?\b/i,
];

function stripHtmlForDetection(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return undefined;
}

export function detectNoteInsights(html: string): NoteDetectionResult {
  const plain = stripHtmlForDetection(html);
  const insights: NoteInsight[] = [];
  const matchedPhrases: Partial<Record<NoteInsight, string>> = {};

  const prayerMatch = firstMatch(plain, PRAYER_PATTERNS);
  if (prayerMatch) {
    insights.push('prayer');
    matchedPhrases.prayer = prayerMatch;
  }

  const devMatch = firstMatch(plain, DEVELOPMENT_PATTERNS);
  if (devMatch) {
    insights.push('development');
    matchedPhrases.development = devMatch;
  }

  return { insights, matchedPhrases };
}

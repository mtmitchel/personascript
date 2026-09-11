/**
 * Decide whether an edit request reads as a standing preference about how
 * the author writes, rather than a one-off change to this draft. Used to
 * offer "save as a style rule" only when it plausibly applies, so the author
 * is not asked on every edit. This is a deterministic heuristic: it never
 * saves anything by itself.
 */

// Words that make a request general regardless of what else it mentions.
const GENERAL = /\b(always|never|in general|generally|from now on|going forward|as a rule|every time|whenever|throughout|across the board|i (?:prefer|like|don't like|do not like|dislike|hate|want you to always|want you to never)|my (?:voice|style|writing|tone))\b/i;

// Vocabulary about voice and style; a preference unless the request points at one passage.
const STYLE = /\b(tone|register|voice|formal|casual|stiff|wordy|verbose|concise|terse|direct|blunt|warm|dry|jargon|buzzwords?|clich[ée]s?|filler|hedg(?:e|ing)|passive voice|first person|second person|contractions?|em[- ]?dash(?:es)?|semicolons?|exclamation (?:marks?|points?)|oxford comma|british|american spelling|sentence length|short(?:er)? sentences|long(?:er)? sentences|adverbs?|adjectives?|rhetorical questions?|metaphors?)\b/i;

// References that tie a request to a specific place in this draft.
const ONE_OFF = /\b(this|that|these|those|here|the (?:first|second|third|fourth|fifth|last|opening|closing|final|next|previous) (?:paragraph|sentence|section|line|heading|passage|part)|paragraph \d+|section \d+|line \d+)\b/i;

export function readsAsStandingPreference(instruction: string): boolean {
  const text = instruction.trim();
  if (!text) return false;
  if (GENERAL.test(text)) return true;
  return STYLE.test(text) && !ONE_OFF.test(text);
}

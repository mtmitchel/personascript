import { diffWords, Change } from 'diff';

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function computeWordDiff(original: string, modified: string): DiffPart[] {
  if (!original && !modified) return [];
  if (!original) return [{ value: modified, added: true }];
  if (!modified) return [{ value: original, removed: true }];

  try {
    const changes: Change[] = diffWords(original, modified);
    return changes.map((c) => ({
      value: c.value,
      added: c.added,
      removed: c.removed,
    }));
  } catch (err) {
    console.error('Diff computation error:', err);
    return [
      { value: original, removed: true },
      { value: modified, added: true },
    ];
  }
}

/**
 * One paragraph-level change the author can accept, reject, or revise.
 * `equal` blocks carry the same paragraphs on both sides; `changed` pairs a
 * run of original paragraphs with the run that replaced it; `removed` and
 * `added` are one-sided. Offsets locate the rewritten paragraphs in the
 * rewritten text so a revision request can quote them exactly.
 */
export interface ParagraphBlock {
  kind: 'equal' | 'changed' | 'removed' | 'added';
  original: string[];
  rewritten: string[];
  rewrittenStart: number;
  rewrittenEnd: number;
}

interface LocatedParagraph { text: string; start: number; end: number }

function locateParagraphs(text: string): LocatedParagraph[] {
  const paragraphs: LocatedParagraph[] = [];
  const separator = /\n[ \t]*\n+/g;
  let start = 0;
  let match: RegExpExecArray | null;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) paragraphs.push({ text: trimmed, start: start + leading, end: start + leading + trimmed.length });
  };
  while ((match = separator.exec(text)) !== null) { push(match.index); start = match.index + match[0].length; }
  push(text.length);
  return paragraphs;
}

const comparable = (paragraph: string) => paragraph.replace(/\s+/g, ' ').trim();

const FUNCTION_WORDS = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'not', 'but', 'has', 'have', 'had',
  'its', 'their', 'they', 'them', 'you', 'your', 'our', 'into', 'onto', 'than', 'then', 'when', 'what', 'which', 'who', 'will', 'would', 'can',
  'could', 'should', 'also', 'been', 'being', 'each', 'these', 'those', 'there', 'here', 'about', 'after', 'before', 'over', 'under', 'more', 'most']);

/** Content words, so shared function words do not make unrelated paragraphs look alike. */
function contentWords(paragraph: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of paragraph.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (word.length >= 3 && !FUNCTION_WORDS.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}

/** Sørensen–Dice overlap of content words, 0–1. */
function similarity(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0; let shared = 0;
  for (const count of a.values()) total += count;
  for (const count of b.values()) total += count;
  if (!total) return 0;
  for (const [word, count] of a) shared += Math.min(count, b.get(word) || 0);
  return (2 * shared) / total;
}

/** Below this overlap a rewritten paragraph is new text, not a revision of an original one. */
const PAIR_THRESHOLD = 0.3;

type Step = { kind: 'pair'; i: number; j: number } | { kind: 'removed'; i: number } | { kind: 'added'; j: number };

/**
 * Align original and rewritten paragraphs in order, pairing each rewritten
 * paragraph with the original it most plausibly revises. A rewrite rarely
 * leaves paragraphs identical, so equality alone would fold the whole
 * document into one change; similarity keeps one decision per passage.
 */
function alignParagraphs(before: string[], after: string[]): Step[] {
  const wordsBefore = before.map(contentWords);
  const wordsAfter = after.map(contentWords);
  const score = (i: number, j: number) => {
    if (comparable(before[i]) === comparable(after[j])) return 2;
    const overlap = similarity(wordsBefore[i], wordsAfter[j]);
    return overlap >= PAIR_THRESHOLD ? overlap : -Infinity;
  };
  const n = before.length; const m = after.length;
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      best[i][j] = Math.max(best[i - 1][j], best[i][j - 1], best[i - 1][j - 1] + score(i - 1, j - 1));
    }
  }
  const steps: Step[] = [];
  let i = n; let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && best[i][j] === best[i - 1][j - 1] + score(i - 1, j - 1) && score(i - 1, j - 1) > -Infinity) {
      steps.push({ kind: 'pair', i: i - 1, j: j - 1 }); i--; j--;
    } else if (j > 0 && (i === 0 || best[i][j] === best[i][j - 1])) {
      steps.push({ kind: 'added', j: j - 1 }); j--;
    } else {
      steps.push({ kind: 'removed', i: i - 1 }); i--;
    }
  }
  return steps.reverse();
}

export function paragraphBlocks(original: string, modified: string): ParagraphBlock[] {
  const before = locateParagraphs(original);
  const after = locateParagraphs(modified);
  const blocks: ParagraphBlock[] = [];
  const push = (block: ParagraphBlock) => {
    const last = blocks[blocks.length - 1];
    // Runs of unchanged, cut, or new paragraphs read as one passage each; every revised pair stays its own decision.
    if (last && last.kind === block.kind && block.kind !== 'changed') {
      last.original.push(...block.original);
      last.rewritten.push(...block.rewritten);
      last.rewrittenEnd = Math.max(last.rewrittenEnd, block.rewrittenEnd);
    } else blocks.push(block);
  };
  for (const step of alignParagraphs(before.map(p => p.text), after.map(p => p.text))) {
    if (step.kind === 'removed') {
      // A cut sits at the position of the next rewritten paragraph.
      const at = after.find(p => p.start >= (blocks[blocks.length - 1]?.rewrittenEnd ?? 0))?.start ?? modified.length;
      push({ kind: 'removed', original: [before[step.i].text], rewritten: [], rewrittenStart: at, rewrittenEnd: at });
      continue;
    }
    const target = after[step.j];
    const span = { rewrittenStart: target.start, rewrittenEnd: target.end };
    if (step.kind === 'added') push({ kind: 'added', original: [], rewritten: [target.text], ...span });
    else if (comparable(before[step.i].text) === comparable(target.text)) push({ kind: 'equal', original: [before[step.i].text], rewritten: [target.text], ...span });
    else push({ kind: 'changed', original: [before[step.i].text], rewritten: [target.text], ...span });
  }
  return blocks;
}

/** The rewritten text with one block's paragraphs replaced by the original ones. */
export function keepOriginalText(blocks: ParagraphBlock[], index: number): string {
  return blocks
    .map((block, position) => (position === index ? block.original : block.rewritten).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

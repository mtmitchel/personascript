import { SelectionRange } from '../types';
import { getDraftParagraphs } from '../sourceText';
import { locateParagraphs } from './diffHelper';
import { plainText } from './richText';

/** Where each numbered paragraph sits in its source text. */
export function paragraphSpans(text: string): Map<number, SelectionRange> {
  const spans = new Map<number, SelectionRange>();
  let cursor = 0;
  for (const paragraph of getDraftParagraphs(text)) {
    const at = text.indexOf(paragraph.text, cursor);
    if (at < 0) continue;
    spans.set(paragraph.id, { start: at, end: at + paragraph.text.length });
    cursor = at + paragraph.text.length;
  }
  return spans;
}

/**
 * The selected passage as it appears in the source text. The rendered draft
 * hides formatting marks, so a selection that crosses one is widened to the
 * paragraphs it touches rather than dropped.
 */
export function locateSelection(source: string, span: SelectionRange, text: string): { text: string; range: SelectionRange } {
  const at = source.indexOf(text, span.start);
  if (at >= 0 && at + text.length <= span.end) return { text, range: { start: at, end: at + text.length } };
  const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
  const paragraphs = locateParagraphs(source.slice(span.start, span.end)).map((paragraph) => ({ start: span.start + paragraph.start, end: span.start + paragraph.end, shown: squash(plainText(paragraph.text)) }));
  if (!paragraphs.length) return { text: source.slice(span.start, span.end), range: span };
  const head = squash(text.slice(0, 24)); const tail = squash(text.slice(-24));
  const first = paragraphs.find((paragraph) => paragraph.shown.includes(head)) ?? paragraphs[0];
  const last = [...paragraphs].reverse().find((paragraph) => paragraph.shown.includes(tail)) ?? paragraphs[paragraphs.length - 1];
  const range = { start: Math.min(first.start, last.start), end: Math.max(first.end, last.end) };
  return { text: source.slice(range.start, range.end), range };
}

export type ResolvedPassageSelection =
  | { kind: 'source'; text: string; from: number; to: number }
  | { kind: 'highlight'; text: string; range?: SelectionRange };

export interface BlockSpan {
  rewrittenStart: number;
  rewrittenEnd: number;
}

export type PassageSelectionMode =
  | { type: 'source-request'; draftText: string }
  | { type: 'original-highlight' }
  | { type: 'rewrite-prose'; rewrittenText: string }
  | { type: 'changes-rewrite'; rewrittenText: string; blocks: BlockSpan[] }
  | { type: 'changes-original' };

export const elementOf = (node: Node): Element | null => {
  if (typeof Element !== 'undefined' && node instanceof Element) return node;
  if ((node as any).parentElement) return (node as any).parentElement;
  if (typeof (node as any).closest === 'function') return node as unknown as Element;
  return null;
};

function paragraphNumber(node: Node, prefix: string): number | null {
  const paragraph = elementOf(node)?.closest('.studio-source-paragraph');
  if (!paragraph) return null;
  const match = paragraph.id.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function resolvePassageSelection(
  root: HTMLElement | null,
  sel: Selection | null,
  mode: PassageSelectionMode,
): ResolvedPassageSelection | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount || !root) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  try {
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

    switch (mode.type) {
      case 'source-request': {
        const from = paragraphNumber(range.startContainer, 'draft-paragraph');
        const to = paragraphNumber(range.endContainer, 'draft-paragraph');
        if (from === null || to === null) return null;
        const spans = paragraphSpans(mode.draftText);
        const first = spans.get(Math.min(from, to));
        const last = spans.get(Math.max(from, to));
        if (!first || !last) return null;
        const located = locateSelection(mode.draftText, { start: first.start, end: last.end }, text);
        return { kind: 'source', text: located.text, from: Math.min(from, to), to: Math.max(from, to) };
      }
      case 'original-highlight':
      case 'changes-original': {
        return { kind: 'highlight', text, range: undefined };
      }
      case 'rewrite-prose': {
        const from = paragraphNumber(range.startContainer, 'rewrite-paragraph');
        const to = paragraphNumber(range.endContainer, 'rewrite-paragraph');
        if (from === null || to === null) return null;
        const spans = paragraphSpans(mode.rewrittenText);
        const first = spans.get(Math.min(from, to));
        const last = spans.get(Math.max(from, to));
        if (!first || !last) return null;
        const located = locateSelection(
          mode.rewrittenText,
          { start: first.start, end: last.end },
          text,
        );
        if (!located.text.trim()) return null;
        return { kind: 'highlight', text: located.text, range: located.range };
      }
      case 'changes-rewrite': {
        const startElement = elementOf(range.startContainer);
        const endElement = elementOf(range.endContainer);
        const first = mode.blocks[Number(startElement?.closest('[data-block]')?.getAttribute('data-block'))];
        const last = mode.blocks[Number(endElement?.closest('[data-block]')?.getAttribute('data-block'))];
        if (!first || !last) return null;
        const located = locateSelection(
          mode.rewrittenText,
          { start: Math.min(first.rewrittenStart, last.rewrittenStart), end: Math.max(first.rewrittenEnd, last.rewrittenEnd) },
          text,
        );
        if (!located.text.trim()) return null;
        return { kind: 'highlight', text: located.text, range: located.range };
      }
    }
  } catch {
    return null;
  }
}


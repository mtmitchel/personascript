import React from 'react';

/**
 * Drafts arrive as Markdown or plain text. The author reads prose, so the
 * Studio renders the formatting and never shows the marks: headings, bold,
 * italics, code, strikethrough, links, bullet and numbered lists, quotes, and
 * rules. Text that is not Markdown passes through unchanged.
 */

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: InlineNode[] }
  | { kind: 'strong' | 'em' | 'del'; children: InlineNode[] };

// Ordered so that longer marks win: code, image, link, bold, strikethrough, italics.
const INLINE = /(`+)([^`]+?)\1|!?\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/gu;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const unescaped = value.replace(/\\([\\`*_{}[\]()#+\-.!~>])/g, '$1');
    const previous = nodes[nodes.length - 1];
    if (previous?.kind === 'text') previous.text += unescaped;
    else nodes.push({ kind: 'text', text: unescaped });
  };
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    // A backslash before the mark keeps it literal.
    if (index > 0 && text[index - 1] === '\\') continue;
    pushText(text.slice(last, index));
    last = index + match[0].length;
    const [, , code, linkText, href, bold, boldAlt, strike, italic, italicAlt] = match;
    if (code !== undefined) nodes.push({ kind: 'code', text: code });
    else if (linkText !== undefined) nodes.push({ kind: 'link', href, children: parseInline(linkText) });
    else if (bold !== undefined || boldAlt !== undefined) nodes.push({ kind: 'strong', children: parseInline(bold ?? boldAlt) });
    else if (strike !== undefined) nodes.push({ kind: 'del', children: parseInline(strike) });
    else nodes.push({ kind: 'em', children: parseInline(italic ?? italicAlt) });
  }
  pushText(text.slice(last));
  return nodes;
}

export function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => node.kind === 'text' || node.kind === 'code' ? node.text : inlineText(node.children)).join('');
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+/;
const NUMBERED = /^\s*(\d+)[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

/** The line as a reader sees it: block marks removed, list items keeping a bullet. */
function plainLine(line: string): string {
  if (RULE.test(line)) return '';
  const heading = line.match(HEADING);
  if (heading) return inlineText(parseInline(heading[2]));
  const body = line.replace(QUOTE, '');
  if (BULLET.test(body)) return '• ' + inlineText(parseInline(body.replace(BULLET, '')));
  return inlineText(parseInline(body));
}

/** Formatting removed, line structure kept. Used to compare and quote passages. */
export function plainText(markdown: string): string {
  return markdown.split('\n').map(plainLine).join('\n');
}

const renderInline = (nodes: InlineNode[]): React.ReactNode[] => nodes.map((node, index) => {
  switch (node.kind) {
    case 'text': return node.text;
    case 'code': return <code key={index}>{node.text}</code>;
    case 'link': return <a key={index} href={node.href} target="_blank" rel="noreferrer">{renderInline(node.children)}</a>;
    case 'strong': return <strong key={index}>{renderInline(node.children)}</strong>;
    case 'em': return <em key={index}>{renderInline(node.children)}</em>;
    case 'del': return <del key={index}>{renderInline(node.children)}</del>;
  }
});

/** Lines of one paragraph rendered inline, with line breaks kept. */
const renderLines = (lines: string[]): React.ReactNode[] => lines.flatMap((line, index) => {
  const heading = line.match(HEADING);
  const content = heading ? <strong key={`h${index}`}>{renderInline(parseInline(heading[2]))}</strong> : renderInline(parseInline(line));
  return index < lines.length - 1 ? [content, <br key={`br${index}`}/>] : [content];
});

/** Consecutive marked lines form items; an unmarked line continues the item before it. */
function listItems(lines: string[], marker: RegExp): string[][] {
  const items: string[][] = [];
  for (const line of lines) {
    if (marker.test(line) || !items.length) items.push([line.replace(marker, '')]);
    else items[items.length - 1].push(line.trim());
  }
  return items;
}

interface RichParagraphProps { text: string; id?: string; className?: string }

/**
 * One draft paragraph as rich text. The element keeps the id and class the
 * Studio uses to point at paragraphs, whatever block form the paragraph takes.
 */
export const RichParagraph: React.FC<RichParagraphProps> = ({ text, id, className }) => {
  const lines = text.split('\n').filter((line) => line.trim());
  const first = lines[0] ?? '';
  if (lines.length === 1 && RULE.test(first)) return <hr id={id} className={className}/>;
  const heading = lines.length === 1 ? first.match(HEADING) : null;
  if (heading) {
    const level = heading[1].length;
    const Tag = level <= 2 ? 'h2' : 'h3';
    return <Tag id={id} className={`${className ?? ''} studio-heading`.trim()}>{renderInline(parseInline(heading[2]))}</Tag>;
  }
  if (lines.every((line) => QUOTE.test(line))) {
    return <blockquote id={id} className={className}>{renderLines(lines.map((line) => line.replace(QUOTE, '')))}</blockquote>;
  }
  if (BULLET.test(first)) {
    return <ul id={id} className={className}>{listItems(lines, BULLET).map((item, index) => <li key={index}>{renderLines(item)}</li>)}</ul>;
  }
  const numbered = first.match(NUMBERED);
  if (numbered) {
    return <ol id={id} className={className} start={Number(numbered[1])}>{listItems(lines, NUMBERED).map((item, index) => <li key={index}>{renderLines(item)}</li>)}</ol>;
  }
  return <p id={id} className={className}>{renderLines(lines)}</p>;
};

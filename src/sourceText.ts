/** Remove repeated page-edge furniture while retaining the document's body text. */
export function cleanPdfPages(pages: string[]): string {
  const lines = pages.map(page => page.split(/\r?\n/));
  const key = (line: string) => line.trim().replace(/\s+/g, ' ')
    .replace(/\bpage\s+\d+(?:\s+(?:of|\/)\s*\d+)?\s*$/i, 'Page #')
    .replace(/^\d+\s*(?:of|\/)\s*\d+$/, '# / #');
  const edges = lines.map(page => {
    const indexes = page.map((line, index) => line.trim() ? index : -1).filter(index => index >= 0);
    return { top: indexes.slice(0, 2), bottom: indexes.slice(-2) };
  });
  const repeated = { top: new Map<string, number>(), bottom: new Map<string, number>() };
  for (const side of ['top', 'bottom'] as const) {
    edges.forEach((edge, page) => {
      const candidates = new Set(edge[side].map(index => key(lines[page][index])).filter(line => line.length <= 160 && !/^\d+$/.test(line)));
      candidates.forEach(line => repeated[side].set(line, (repeated[side].get(line) || 0) + 1));
    });
  }
  const threshold = Math.max(2, Math.ceil(pages.length / 2));
  return lines.map((page, pageIndex) => {
    const remove = new Set<number>();
    for (const side of ['top', 'bottom'] as const) {
      for (const index of edges[pageIndex][side]) {
        const line = page[index].trim();
        const numbered = /^(?:page\s+\d+(?:\s+(?:of|\/)\s*\d+)?|\d+\s*(?:of|\/)\s*\d+)$/i.test(line)
          && Number(line.match(/\d+/)?.[0]) === pageIndex + 1;
        if (numbered || (repeated[side].get(key(line)) || 0) >= threshold) remove.add(index);
      }
    }
    return page.filter((_, index) => !remove.has(index)).join('\n').trim();
  }).filter(Boolean).join('\n\n');
}

/** Old pdf-parse uploads contain its numbered page joiners. Plain text is unchanged. */
export function cleanSourceText(text: string): string {
  const markers = [...text.matchAll(/^\s*--\s*(\d+)\s+of\s+(\d+)\s*--\s*$/gm)];
  if (markers.length < 2 || markers.some((match, index) => Number(match[1]) !== index + 1 || Number(match[2]) !== markers.length)
    || text.slice(markers.at(-1)!.index! + markers.at(-1)![0].length).trim()) return text;
  let start = 0;
  const pages = markers.map(marker => {
    const page = text.slice(start, marker.index);
    start = marker.index! + marker[0].length;
    return page;
  });
  return cleanPdfPages(pages);
}

export function sourceContainsPhrase(source: string, phrase: string): boolean {
  const normalize = (value: string) => value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const quote = normalize(phrase);
  return Boolean(quote && (normalize(source).includes(quote) || normalize(cleanSourceText(source)).includes(quote)));
}

/** Stable review units. PDF hard wraps lose paragraph gaps, so sentence-ending
 * lines and short standalone headings are also boundaries. No prose is omitted. */
export function getDraftParagraphs(text: string): { id: number; text: string }[] {
  const paragraphs: string[] = [];
  for (const block of cleanSourceText(text).trim().split(/\n\s*\n/)) {
    const lines = block.split(/\r?\n/).filter(line => line.trim());
    let pending: string[] = [];
    const flush = () => { if (pending.length) paragraphs.push(pending.join('\n').trim()); pending = []; };
    lines.forEach((line, index) => {
      pending.push(line);
      const joined = pending.join(' ').trim();
      const next = lines[index + 1]?.trim();
      const heading = joined.length <= 100 && !/[.!?;,]/.test(joined)
        && (!joined.includes(':') || (pending.length === 1 && joined.length <= 60 && joined.endsWith(':')))
        && next && /^[A-Z]/.test(next);
      if (/[.!?][”’"')\]]?$/.test(line.trim()) || heading || /^\s*[-*•]\s/.test(next || '')) flush();
    });
    flush();
  }
  return paragraphs.map((text, index) => ({ id: index + 1, text }));
}

/** A paragraph that names the section it starts: a Markdown heading or one short unpunctuated line. */
export function isHeadingParagraph(text: string): boolean {
  const line = text.trim();
  if (!line || line.includes('\n')) return false;
  if (/^#{1,6}\s+\S/.test(line)) return true;
  return line.length <= 100 && !/[.!?;,]/.test(line) && (!line.includes(':') || line.endsWith(':'));
}

/** The heading as a reader would say it: no Markdown marks, no trailing colon. */
export function headingText(text: string): string {
  return text.trim().replace(/^#{1,6}\s+/, '').replace(/:$/, '').trim();
}

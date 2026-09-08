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

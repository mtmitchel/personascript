import React, { useMemo, useState } from 'react';
import { computeWordDiff, paragraphBlocks, type ParagraphBlock } from '../utils/diffHelper';

interface DiffViewerProps {
  original: string;
  modified: string;
  /** Replace this block's rewritten paragraphs with the original ones. */
  onKeepOriginal?: (index: number, blocks: ParagraphBlock[]) => void;
  /** Open a revision request quoting this block's rewritten paragraphs. */
  onRevise?: (block: ParagraphBlock) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

/**
 * Track changes, passage by passage. Unchanged paragraphs read as plain text.
 * Each revised paragraph shows its word-level difference with Accept, Keep
 * original, Revise; a cut passage offers Restore; a new passage offers Remove.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ original, modified, onKeepOriginal, onRevise, onUndo, canUndo }) => {
  const blocks = useMemo(() => paragraphBlocks(original, modified), [original, modified]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const keyOf = (block: ParagraphBlock) => `${block.kind}:${block.original.join('\n')}→${block.rewritten.join('\n')}`;
  const changes = blocks.filter(block => block.kind !== 'equal');
  const remaining = changes.filter(block => !accepted.includes(keyOf(block))).length;

  const toggleAccepted = (block: ParagraphBlock) => {
    const key = keyOf(block);
    setAccepted(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  };

  const renderWordDiff = (block: ParagraphBlock) => {
    const parts = computeWordDiff(block.original.join('\n\n'), block.rewritten.join('\n\n'));
    return parts.map((part, index) => part.added
      ? <ins key={index} className="studio-change-added">{part.value}</ins>
      : part.removed
        ? <del key={index} className="studio-change-removed">{part.value}</del>
        : <span key={index}>{part.value}</span>);
  };

  return (
    <div className="studio-changes">
      <div className="studio-changes-summary">
        <span>{changes.length === 0 ? 'No changes.' : remaining === 0 ? `All ${changes.length} changes accepted.` : `${remaining} of ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} to look at.`}</span>
        {canUndo && onUndo && <button type="button" className="studio-text-button" onClick={onUndo}>Undo</button>}
      </div>
      {blocks.map((block, index) => {
        if (block.kind === 'equal') {
          return block.rewritten.map((paragraph, position) => <p key={`${index}-${position}`} className="studio-source-paragraph">{paragraph}</p>);
        }
        const isAccepted = accepted.includes(keyOf(block));
        return (
          <section key={index} className={`studio-change${isAccepted ? ' is-accepted' : ''} is-${block.kind}`} aria-label={block.kind === 'removed' ? 'Removed passage' : block.kind === 'added' ? 'Added passage' : 'Changed passage'}>
            <div className="studio-change-text">
              {isAccepted
                ? block.rewritten.map((paragraph, position) => <p key={position}>{paragraph}</p>)
                : block.kind === 'removed'
                  ? block.original.map((paragraph, position) => <p key={position}><del className="studio-change-removed">{paragraph}</del></p>)
                  : <p>{renderWordDiff(block)}</p>}
            </div>
            <div className="studio-change-actions">
              {isAccepted ? (
                <>
                  <span className="studio-note-state">Accepted</span>
                  <button type="button" className="studio-text-button" onClick={() => toggleAccepted(block)}>Undo</button>
                </>
              ) : (
                <>
                  <button type="button" className="studio-text-button" onClick={() => toggleAccepted(block)}>Accept</button>
                  {onKeepOriginal && <button type="button" className="studio-text-button" onClick={() => onKeepOriginal(index, blocks)}>{block.kind === 'added' ? 'Remove' : block.kind === 'removed' ? 'Restore' : 'Keep original'}</button>}
                  {onRevise && block.rewritten.length > 0 && <button type="button" className="studio-text-button" onClick={() => onRevise(block)}>Revise</button>}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

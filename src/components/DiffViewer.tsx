import React, { useState } from 'react';
import { computeWordDiff, type ParagraphBlock } from '../utils/diffHelper';
import { plainText, RichParagraph } from '../utils/richText';

interface DiffViewerProps {
  blocks: ParagraphBlock[];
  /** Replace this block's rewritten paragraphs with the original ones. */
  onKeepOriginal?: (index: number) => void;
  /** Open a revision request quoting this block's rewritten paragraphs. */
  onRevise?: (block: ParagraphBlock) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

const paragraphs = (texts: string[], prefix: string) =>
  texts.map((text, index) => (
    <RichParagraph key={`${prefix}-${index}`} text={text} className="studio-source-paragraph" />
  ));

/**
 * Track changes as two columns: the original draft on the left, the rewrite on
 * the right, aligned passage by passage. A revised passage strikes the words
 * that went on the left and marks the words that arrived on the right, with
 * Accept, Keep original, Revise beneath; a cut passage offers Restore; a new
 * passage offers Remove. Unchanged passages read as plain text on both sides.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  blocks,
  onKeepOriginal,
  onRevise,
  onUndo,
  canUndo,
}) => {
  const [accepted, setAccepted] = useState<string[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const keyOf = (block: ParagraphBlock) =>
    `${block.kind}:${block.original.join('\n')}→${block.rewritten.join('\n')}`;
  const changes = blocks.filter(block => block.kind !== 'equal');
  const remaining = changes.filter(block => !accepted.includes(keyOf(block))).length;

  const toggleAccepted = (block: ParagraphBlock) => {
    const key = keyOf(block);
    setAccepted(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    );
  };

  const acceptAll = () => {
    setAccepted(changes.map(keyOf));
  };

  const unacceptedIndices = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind !== 'equal' && !accepted.includes(keyOf(block)))
    .map(({ index }) => index);

  const currentFocus = focusIndex ?? (unacceptedIndices.length > 0 ? unacceptedIndices[0] : null);
  const hasPrev = currentFocus !== null && unacceptedIndices.some(i => i < currentFocus);
  const hasNext = currentFocus !== null && unacceptedIndices.some(i => i > currentFocus);

  const focusChange = (targetIndex: number) => {
    setFocusIndex(targetIndex);
    const element = document.querySelector<HTMLElement>(`[data-block="${targetIndex}"]`);
    if (element) {
      element.scrollIntoView({ block: 'center' });
      element.focus();
    }
  };

  const handlePrev = () => {
    if (currentFocus === null) return;
    const prevIndices = unacceptedIndices.filter(i => i < currentFocus);
    const target = prevIndices.length > 0 ? prevIndices[prevIndices.length - 1] : unacceptedIndices[unacceptedIndices.length - 1];
    if (target !== undefined) focusChange(target);
  };

  const handleNext = () => {
    if (currentFocus === null) return;
    const nextIndices = unacceptedIndices.filter(i => i > currentFocus);
    const target = nextIndices.length > 0 ? nextIndices[0] : unacceptedIndices[0];
    if (target !== undefined) focusChange(target);
  };

  const countText =
    changes.length === 0
      ? 'No changes.'
      : remaining === 0
      ? `All ${changes.length} changes accepted.`
      : `${remaining} of ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} to look at.`;

  // Formatting is compared as the reader sees it, so Markdown marks never show as edits.
  const wordDiff = (block: ParagraphBlock) =>
    computeWordDiff(plainText(block.original.join('\n\n')), plainText(block.rewritten.join('\n\n')));
  const originalSide = (block: ParagraphBlock) => (
    <p className="studio-source-paragraph">
      {wordDiff(block)
        .filter(part => !part.added)
        .map((part, index) =>
          part.removed ? (
            <del key={index} className="studio-change-removed">
              {part.value}
            </del>
          ) : (
            <span key={index}>{part.value}</span>
          )
        )}
    </p>
  );
  const rewriteSide = (block: ParagraphBlock) => (
    <p className="studio-source-paragraph">
      {wordDiff(block)
        .filter(part => !part.removed)
        .map((part, index) =>
          part.added ? (
            <ins key={index} className="studio-change-added">
              {part.value}
            </ins>
          ) : (
            <span key={index}>{part.value}</span>
          )
        )}
    </p>
  );

  return (
    <div className="studio-changes">
      <div className="studio-changes-header">
        <div id="changes-toolbar" className="studio-changes-toolbar">
          <span>{countText}</span>
          {changes.length > 1 && (
            <>
              <button
                type="button"
                className="studio-text-button"
                aria-label="Previous change"
                disabled={!hasPrev}
                onClick={handlePrev}
              >
                Previous
              </button>
              <button
                type="button"
                className="studio-text-button"
                aria-label="Next change"
                disabled={!hasNext}
                onClick={handleNext}
              >
                Next
              </button>
            </>
          )}
          {remaining > 0 && (
            <button type="button" className="studio-text-button" onClick={acceptAll}>
              Accept all
            </button>
          )}
          {canUndo && onUndo && (
            <button
              type="button"
              className="studio-text-button"
              title="Undo the last Keep original, Restore, or Remove"
              onClick={onUndo}
            >
              Undo
            </button>
          )}
        </div>
        <div className="studio-compare-head" aria-hidden="true">
          <span>Original</span>
          <span>Rewrite</span>
        </div>
      </div>
      {blocks.map((block, index) => {
        const isAccepted = block.kind !== 'equal' && accepted.includes(keyOf(block));
        const settled = block.kind === 'equal' || isAccepted;
        return (
          <section
            key={index}
            id={`change-${index}`}
            data-block={index}
            tabIndex={-1}
            className={`studio-change is-${block.kind}${isAccepted ? ' is-accepted' : ''}`}
            aria-label={
              block.kind === 'equal'
                ? 'Unchanged passage'
                : block.kind === 'removed'
                ? 'Removed passage'
                : block.kind === 'added'
                ? 'Added passage'
                : 'Changed passage'
            }
          >
            <div className="studio-change-side" data-side="original">
              {settled || block.kind === 'added'
                ? paragraphs(block.original, 'o')
                : block.kind === 'removed'
                ? <del className="studio-change-removed">{paragraphs(block.original, 'o')}</del>
                : originalSide(block)}
            </div>
            <div className="studio-change-side" data-side="rewrite">
              {settled || block.kind === 'removed'
                ? paragraphs(block.rewritten, 'r')
                : block.kind === 'added'
                ? <ins className="studio-change-added">{paragraphs(block.rewritten, 'r')}</ins>
                : rewriteSide(block)}
            </div>
            {block.kind !== 'equal' && (
              <div className="studio-change-actions">
                {isAccepted ? (
                  <>
                    <span className="studio-note-state">Accepted</span>
                    <button type="button" className="studio-text-button" onClick={() => toggleAccepted(block)}>
                      Undo
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="studio-text-button" onClick={() => toggleAccepted(block)}>
                      Accept
                    </button>
                    {onKeepOriginal && (
                      <button type="button" className="studio-text-button" onClick={() => onKeepOriginal(index)}>
                        {block.kind === 'added' ? 'Remove' : block.kind === 'removed' ? 'Restore' : 'Keep original'}
                      </button>
                    )}
                    {onRevise && block.rewritten.length > 0 && (
                      <button type="button" className="studio-text-button" onClick={() => onRevise(block)}>
                        Revise
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

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
 * the right, aligned text by text. A revised text strikes the words
 * that went on the left and marks the words that arrived on the right, with
 * Use original text and Ask for a change beneath; a cut text offers Restore deleted text;
 * a new text offers Remove added text. Unchanged texts read as plain text on both sides.
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  blocks,
  onKeepOriginal,
  onRevise,
  onUndo,
  canUndo,
}) => {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const changes = blocks.filter(block => block.kind !== 'equal');
  const changeIndices = blocks
    .map((block, index) => (block.kind !== 'equal' ? index : -1))
    .filter(i => i >= 0);

  const currentFocus = focusIndex ?? changeIndices[0] ?? null;
  const hasPrev = currentFocus !== null && changeIndices.some(i => i < currentFocus);
  const hasNext = currentFocus !== null && changeIndices.some(i => i > currentFocus);

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
    const prevIndices = changeIndices.filter(i => i < currentFocus);
    const target = prevIndices.length > 0 ? prevIndices[prevIndices.length - 1] : changeIndices[changeIndices.length - 1];
    if (target !== undefined) focusChange(target);
  };

  const handleNext = () => {
    if (currentFocus === null) return;
    const nextIndices = changeIndices.filter(i => i > currentFocus);
    const target = nextIndices.length > 0 ? nextIndices[0] : changeIndices[0];
    if (target !== undefined) focusChange(target);
  };

  const countText =
    changes.length === 0
      ? 'No changes.'
      : changes.length === 1
      ? '1 change.'
      : `${changes.length} changes.`;

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
          <span role="status">{countText}</span>
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
          {canUndo && onUndo && (
            <button
              type="button"
              className="studio-text-button"
              title="Undo the last Use original text, Restore deleted text, or Remove added text"
              onClick={onUndo}
            >
              Undo text change
            </button>
          )}
        </div>
        <div className="studio-compare-head" aria-hidden="true">
          <span>Original</span>
          <span>Rewrite</span>
        </div>
      </div>
      {blocks.map((block, index) => {
        const settled = block.kind === 'equal';
        return (
          <section
            key={index}
            id={`change-${index}`}
            data-block={index}
            tabIndex={-1}
            className={`studio-change is-${block.kind}${index === currentFocus ? ' is-current' : ''}`}
            aria-current={index === currentFocus ? 'true' : undefined}
            aria-label={
              block.kind === 'equal'
                ? 'Unchanged text'
                : block.kind === 'removed'
                ? 'Removed text'
                : block.kind === 'added'
                ? 'Added text'
                : 'Changed text'
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
                {onKeepOriginal && (
                  <button type="button" className="studio-text-button" onClick={() => onKeepOriginal(index)}>
                    {block.kind === 'added' ? 'Remove added text' : block.kind === 'removed' ? 'Restore deleted text' : 'Use original text'}
                  </button>
                )}
                {onRevise && block.rewritten.length > 0 && (
                  <button type="button" className="studio-text-button" onClick={() => onRevise(block)}>
                    Ask for a change
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

import React, { useMemo } from 'react';
import { computeWordDiff } from '../utils/diffHelper';

interface DiffViewerProps {
  original: string;
  modified: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ original, modified }) => {
  const diffParts = useMemo(() => {
    return computeWordDiff(original, modified);
  }, [original, modified]);

  const stats = useMemo(() => {
    let addedWords = 0;
    let removedWords = 0;
    let unchangedWords = 0;

    diffParts.forEach((part) => {
      const words = part.value.trim().split(/\s+/).filter(Boolean).length;
      if (part.added) addedWords += words;
      else if (part.removed) removedWords += words;
      else unchangedWords += words;
    });

    return { addedWords, removedWords, unchangedWords };
  }, [diffParts]);

  return (
    <div className="space-y-3">
      {/* Diff legend and quick stats */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-200 border border-emerald-400 inline-block" />
            <span className="text-neutral-700">
              Added (<strong className="font-mono">+{stats.addedWords}</strong> words)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-200 border border-rose-400 inline-block" />
            <span className="text-neutral-700">
              Removed (<strong className="font-mono">-{stats.removedWords}</strong> words)
            </span>
          </div>
        </div>

        <span className="text-neutral-400 font-mono text-[11px]">
          Word diff
        </span>
      </div>

      {/* Rendered Diff Text */}
      <div
        id="diff-prose-container"
        className="p-4 rounded-lg bg-white border border-neutral-200 text-neutral-900 font-sans leading-relaxed text-xs whitespace-pre-wrap"
      >
        {diffParts.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="bg-emerald-50 text-emerald-900 font-medium px-1 py-0.5 rounded mx-0.5"
                title="Adapted phrasing"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="bg-rose-50 text-rose-800 line-through px-1 py-0.5 rounded mx-0.5 opacity-60"
                title="Removed"
              >
                {part.value}
              </span>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </div>
    </div>
  );
};

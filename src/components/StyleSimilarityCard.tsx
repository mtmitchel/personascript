import React from 'react';
import { StyleSimilarityScore } from '../types';
import { CheckCircle2, Info, Compass } from 'lucide-react';

interface StyleSimilarityCardProps {
  score: StyleSimilarityScore;
  profileName?: string;
}

export const StyleSimilarityCard: React.FC<StyleSimilarityCardProps> = ({ score, profileName = 'Your Voice Profile' }) => {
  if (!score) return null;

  return (
    <div
      id="style-similarity-card"
      className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-neutral-900">
                Voice match score
              </h4>
              <span className="text-[11px] text-neutral-500">
                {profileName}
              </span>
            </div>
          </div>
        </div>

        {/* Overall Percentage */}
        <div
          id="overall-similarity-badge"
          className="flex items-baseline space-x-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 shrink-0"
        >
          <span className="text-xl font-bold font-mono text-neutral-900 leading-none">
            {score.overallPercentage}%
          </span>
          <span className="text-xs text-neutral-500 font-medium">match</span>
        </div>
      </div>

      {/* Explanation Quote */}
      <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100 text-xs text-neutral-700 leading-relaxed flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
        <div>
          <p>{score.explanation}</p>
          {score.deviationsNote && (
            <p className="mt-1 text-neutral-500 text-[11px]">
              Note: {score.deviationsNote}
            </p>
          )}
        </div>
      </div>

      {/* 4-Dimensional Metric Breakdown */}
      {score.breakdown && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
            <div className="flex justify-between text-[11px] text-neutral-600 mb-1 font-medium">
              <span>Rhythm & pacing</span>
              <span className="font-mono text-neutral-900">{score.breakdown.cadenceMatch}%</span>
            </div>
            <div className="w-full h-1 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 rounded-full"
                style={{ width: `${score.breakdown.cadenceMatch}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
            <div className="flex justify-between text-[11px] text-neutral-600 mb-1 font-medium">
              <span>Word choice</span>
              <span className="font-mono text-neutral-900">{score.breakdown.vocabularyFidelity}%</span>
            </div>
            <div className="w-full h-1 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 rounded-full"
                style={{ width: `${score.breakdown.vocabularyFidelity}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
            <div className="flex justify-between text-[11px] text-neutral-600 mb-1 font-medium">
              <span>Tone & attitude</span>
              <span className="font-mono text-neutral-900">{score.breakdown.toneConsistency}%</span>
            </div>
            <div className="w-full h-1 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 rounded-full"
                style={{ width: `${score.breakdown.toneConsistency}%` }}
              />
            </div>
          </div>

          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
            <div className="flex justify-between text-[11px] text-neutral-600 mb-1 font-medium">
              <span>Domain accuracy</span>
              <span className="font-mono text-neutral-900">{score.breakdown.domainConformance}%</span>
            </div>
            <div className="w-full h-1 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 rounded-full"
                style={{ width: `${score.breakdown.domainConformance}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Key Strengths */}
      {score.strengths && score.strengths.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-medium text-neutral-500 mb-1.5">
            Voice traits captured:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {score.strengths.map((str, idx) => (
              <span
                key={idx}
                className="inline-flex items-center text-xs bg-neutral-50 text-neutral-800 border border-neutral-200 px-2 py-0.5 rounded"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-600 mr-1.5 shrink-0" />
                {str}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

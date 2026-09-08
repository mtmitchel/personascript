import React from 'react';
import { ToneAdjustments } from '../types';
import { RotateCcw } from 'lucide-react';

interface ToneSlidersControlProps {
  adjustments: ToneAdjustments;
  onChange: (adjustments: ToneAdjustments) => void;
  onReset: () => void;
  baseFormality?: number;
}

export const ToneSlidersControl: React.FC<ToneSlidersControlProps> = ({
  adjustments,
  onChange,
  onReset,
  baseFormality = 65,
}) => {
  const getFormalityLabel = (val: number) => {
    if (val < 30) return 'Casual and conversational';
    if (val < 45) return 'Approachable';
    if (val < 65) return 'Balanced (profile default)';
    if (val < 80) return 'Formal and professional';
    return 'Academic and strict';
  };

  const getEnthusiasmLabel = (val: number) => {
    if (val < 30) return 'Subdued and analytical';
    if (val < 45) return 'Measured';
    if (val < 65) return 'Engaged (profile default)';
    if (val < 80) return 'Energetic';
    return 'Urgent and emphatic';
  };

  const getConcisenessLabel = (val: number) => {
    if (val < 30) return 'Expansive and detailed';
    if (val < 45) return 'Detailed';
    if (val < 65) return 'Balanced (profile default)';
    if (val < 80) return 'Direct and punchy';
    return 'Ultra-concise';
  };

  return (
    <div
      id="tone-sliders-control"
      className="bg-white border border-neutral-200 rounded-xl p-4 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
        <h4 className="text-xs font-medium text-neutral-900">
          Tone adjustments
        </h4>

        <button
          id="btn-reset-sliders"
          type="button"
          onClick={onReset}
          title="Reset to profile default"
          className="text-[11px] text-neutral-400 hover:text-neutral-800 flex items-center gap-1 transition"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Formality Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-700">
              Formality: <span className="text-neutral-500 font-normal">{getFormalityLabel(adjustments.formality)}</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              {adjustments.formality}/100
            </span>
          </div>
          <input
            id="slider-formality"
            type="range"
            min="0"
            max="100"
            step="5"
            value={adjustments.formality}
            onChange={(e) =>
              onChange({ ...adjustments, formality: parseInt(e.target.value, 10) })
            }
            className="w-full h-1 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>Conversational</span>
            <span className="text-neutral-600">Profile ({baseFormality})</span>
            <span>Formal</span>
          </div>
        </div>

        {/* Enthusiasm Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-700">
              Enthusiasm: <span className="text-neutral-500 font-normal">{getEnthusiasmLabel(adjustments.enthusiasm)}</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              {adjustments.enthusiasm}/100
            </span>
          </div>
          <input
            id="slider-enthusiasm"
            type="range"
            min="0"
            max="100"
            step="5"
            value={adjustments.enthusiasm}
            onChange={(e) =>
              onChange({ ...adjustments, enthusiasm: parseInt(e.target.value, 10) })
            }
            className="w-full h-1 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>Subdued</span>
            <span>Balanced</span>
            <span>High energy</span>
          </div>
        </div>

        {/* Conciseness Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-700">
              Conciseness: <span className="text-neutral-500 font-normal">{getConcisenessLabel(adjustments.conciseness)}</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              {adjustments.conciseness}/100
            </span>
          </div>
          <input
            id="slider-conciseness"
            type="range"
            min="0"
            max="100"
            step="5"
            value={adjustments.conciseness}
            onChange={(e) =>
              onChange({ ...adjustments, conciseness: parseInt(e.target.value, 10) })
            }
            className="w-full h-1 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
          />
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>Expansive</span>
            <span>Balanced</span>
            <span>Sharp</span>
          </div>
        </div>
      </div>
    </div>
  );
};

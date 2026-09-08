import React, { useState } from 'react';
import { DomainExpertise } from '../types';
import { BookOpen, Plus, X, Check } from 'lucide-react';

interface DomainExpertiseEditorProps {
  expertise: DomainExpertise;
  onSave: (expertise: DomainExpertise) => void;
  onClose?: () => void;
  isInline?: boolean;
}

export const DomainExpertiseEditor: React.FC<DomainExpertiseEditorProps> = ({
  expertise,
  onSave,
  onClose,
  isInline = false,
}) => {
  const [localExpertise, setLocalExpertise] = useState<DomainExpertise>({
    enabled: expertise?.enabled ?? true,
    field: expertise?.field || '',
    disciplines: expertise?.disciplines ? [...expertise.disciplines] : undefined,
    topics: expertise?.topics ? expertise.topics.map((t) => ({ ...t })) : undefined,
    keyTerminology: [...(expertise?.keyTerminology || [])],
    conventions: [...(expertise?.conventions || [])],
    audienceContext: expertise?.audienceContext || '',
    customNotes: expertise?.customNotes || '',
  });

  const [termInput, setTermInput] = useState('');
  const [guidelinesText, setGuidelinesText] = useState<string>(() => {
    if (expertise?.customNotes && expertise.customNotes.trim()) {
      return expertise.customNotes;
    }
    if (expertise?.conventions && expertise.conventions.length > 0) {
      return expertise.conventions.map((c) => `• ${c}`).join('\n');
    }
    return '';
  });

  const handleAddTerm = () => {
    const raw = termInput.trim();
    if (!raw) return;

    const terms = raw
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const currentTerms = localExpertise.keyTerminology || [];
    const newUnique = terms.filter((t) => !currentTerms.includes(t));

    if (newUnique.length > 0) {
      setLocalExpertise((prev) => ({
        ...prev,
        keyTerminology: [...currentTerms, ...newUnique],
      }));
    }
    setTermInput('');
  };

  const handleRemoveTerm = (term: string) => {
    setLocalExpertise((prev) => ({
      ...prev,
      keyTerminology: prev.keyTerminology.filter((t) => t !== term),
    }));
  };

  const handleGuidelinesChange = (val: string) => {
    setGuidelinesText(val);
    const parsedConventions = val
      .split('\n')
      .map((line) => line.trim().replace(/^[•\-\*]\s*/, ''))
      .filter(Boolean);

    setLocalExpertise((prev) => ({
      ...prev,
      customNotes: val,
      conventions: parsedConventions,
    }));
  };

  const handleSave = () => {
    onSave(localExpertise);
    if (onClose) onClose();
  };

  return (
    <div
      id="domain-expertise-editor"
      className={`${
        isInline ? 'bg-neutral-50 p-4 rounded-xl border border-neutral-200' : 'bg-white p-5 rounded-xl border border-neutral-200 max-w-2xl w-full'
      } space-y-5`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <div className="flex items-center space-x-2.5">
          <BookOpen className="w-4 h-4 text-neutral-700" />
          <h3 className="text-sm font-semibold text-neutral-900">
            Domain Knowledge
          </h3>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center cursor-pointer gap-1.5 text-xs text-neutral-600">
            <span>Enabled</span>
            <input
              id="toggle-domain-active"
              type="checkbox"
              checked={localExpertise.enabled}
              onChange={(e) => setLocalExpertise((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900"
            />
          </label>
          {onClose && (
            <button
              id="close-domain-editor"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Field and Specialization */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-700 block">
          Field or discipline
        </label>
        <input
          id="domain-field-input"
          type="text"
          value={localExpertise.field}
          onChange={(e) => setLocalExpertise((prev) => ({ ...prev, field: e.target.value }))}
          placeholder="e.g. Distributed Cloud Systems Engineering, Environmental Law"
          className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900"
        />
      </div>

      {/* Target Audience */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-700 block">
          Target audience
        </label>
        <input
          id="domain-audience-input"
          type="text"
          value={localExpertise.audienceContext || ''}
          onChange={(e) => setLocalExpertise((prev) => ({ ...prev, audienceContext: e.target.value }))}
          placeholder="e.g. Staff engineers, executive leadership, or public stakeholders"
          className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900"
        />
      </div>

      {/* Key Terminology Chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-neutral-700">
            Key terminology & acronyms
          </label>
          <span className="text-[11px] text-neutral-400 font-mono">
            {localExpertise.keyTerminology.length} terms
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-1 max-h-32 overflow-y-auto">
          {localExpertise.keyTerminology.map((term) => (
            <span
              key={term}
              className="inline-flex items-center gap-1 text-xs bg-white border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded"
            >
              <span>{term}</span>
              <button
                type="button"
                onClick={() => handleRemoveTerm(term)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {localExpertise.keyTerminology.length === 0 && (
            <span className="text-xs text-neutral-400 italic">No terms added.</span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={termInput}
            onChange={(e) => setTermInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTerm();
              }
            }}
            placeholder="Add term (press Enter or use commas)"
            className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={handleAddTerm}
            disabled={!termInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Unified Field Guidelines & Context */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-700 block">
          Field guidelines & context
        </label>
        <textarea
          rows={5}
          value={guidelinesText}
          onChange={(e) => handleGuidelinesChange(e.target.value)}
          placeholder={`e.g.
• Quantify trade-offs with concrete metrics
• Address failure modes and recovery when proposing designs
• Assume readers are familiar with core domain standards`}
          className="w-full text-xs p-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:border-neutral-900 font-sans leading-relaxed resize-y"
        />
        <p className="text-[11px] text-neutral-400">
          Enter conventions, writing rules, background information, or domain constraints.
        </p>
      </div>

      {/* Save Button */}
      <div className="pt-2 flex justify-end">
        <button
          id="save-domain-editor"
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save domain settings</span>
        </button>
      </div>
    </div>
  );
};

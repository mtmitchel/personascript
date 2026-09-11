import React, { useState, useEffect } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DomainExpertise } from '../types';
import {
  Plus,
  X,
  Check,
  Layers,
} from 'lucide-react';
import { normalizeDomainExpertise } from '../writingPipeline';
import { DomainTopicsSection } from './DomainTopicsSection';
import { DomainProductsSection } from './DomainProductsSection';
import { StepFooter } from './StepFooter';

export const DomainView: React.FC = () => {
  const {
    domainExpertise,
    updateDomainExpertise,
    setActiveTab,
    modelSettings,
    draftText,
    projectBrief,
    isUploadingDraft,
    isUploadingBrief,
    useDraftAndBrief,
    setUseDraftAndBrief,
  } = useWritingAssistant();

  const sourceUploadPending = useDraftAndBrief && (isUploadingDraft || isUploadingBrief);

  const [localExpertise, setLocalExpertise] = useState<DomainExpertise>(() => {
    return normalizeDomainExpertise(domainExpertise);
  });

  const [newDisciplineInput, setNewDisciplineInput] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Unified guidelines text
  const [guidelinesText, setGuidelinesText] = useState<string>(() => {
    if (localExpertise.customNotes && localExpertise.customNotes.trim()) {
      return localExpertise.customNotes;
    }
    if (localExpertise.conventions && localExpertise.conventions.length > 0) {
      return localExpertise.conventions.map((c) => `• ${c}`).join('\n');
    }
    return '';
  });

  // Sync from context when changed externally
  useEffect(() => {
    setLocalExpertise(normalizeDomainExpertise(domainExpertise));
    setGuidelinesText(domainExpertise.customNotes ?? (domainExpertise.conventions || []).join('\n'));
  }, [domainExpertise]);

  const flashSaved = () => {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  // Save expertise with single-ownership normalization
  const saveExpertise = (updated: DomainExpertise) => {
    const normalized = normalizeDomainExpertise(updated);
    setLocalExpertise(normalized);
    updateDomainExpertise(normalized);
    flashSaved();
  };

  const handleToggleEnabled = (enabled: boolean) => {
    const updated = { ...localExpertise, enabled };
    setLocalExpertise(updated);
    updateDomainExpertise(updated);
  };

  const handleFieldChange = (val: string) => {
    const updated = { ...localExpertise, field: val };
    setLocalExpertise(updated);
    updateDomainExpertise(updated);
  };

  const handleAudienceChange = (val: string) => {
    const updated = { ...localExpertise, audienceContext: val };
    setLocalExpertise(updated);
    updateDomainExpertise(updated);
  };

  const handleAddDiscipline = () => {
    const raw = newDisciplineInput.trim();
    if (!raw) return;
    const current = localExpertise.disciplines || [];
    if (!current.includes(raw)) {
      const updatedDisciplines = [...current, raw];
      const updatedField = updatedDisciplines.join(' & ');
      const updated = {
        ...localExpertise,
        disciplines: updatedDisciplines,
        field: updatedField,
      };
      setLocalExpertise(updated);
      updateDomainExpertise(updated);
      flashSaved();
    }
    setNewDisciplineInput('');
  };

  const handleRemoveDiscipline = (item: string) => {
    const current = localExpertise.disciplines || [];
    const updatedDisciplines = current.filter((d) => d !== item);
    const updatedField = updatedDisciplines.length > 0 ? updatedDisciplines.join(' & ') : localExpertise.field;
    const updated = {
      ...localExpertise,
      disciplines: updatedDisciplines,
      field: updatedField,
    };
    setLocalExpertise(updated);
    updateDomainExpertise(updated);
  };

  const handleGuidelinesChange = (val: string) => {
    setGuidelinesText(val);
    const updated = {
      ...localExpertise,
      customNotes: val,
    };
    setLocalExpertise(updated);
    updateDomainExpertise(updated);
  };

  const topicsList = localExpertise.topics || [];
  const activeTopicCount = topicsList.filter((t) => t.enabled).length;
  const activeProductCount = (localExpertise.productKnowledge || []).filter((p) => p.enabled).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500">Step 4 of 5</p>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
            Domain Knowledge
          </h1>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            Review the relevant concepts and product facts. Next, create the edit plan and rewrite in Studio.
          </p>
        </div>
      </div>

      {/* Switch row */}
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-neutral-200">
        <label htmlFor="toggle-domain-enable" className="flex items-start gap-3 cursor-pointer select-none">
          <input
            id="toggle-domain-enable"
            type="checkbox"
            checked={localExpertise.enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
          />
          <div>
            <span className="text-sm font-medium text-neutral-900 block">
              Use this knowledge in rewrites
            </span>
            <span className="text-xs text-neutral-500">
              Off means the writer ignores every topic and product below.
            </span>
          </div>
        </label>

        {savedFeedback && (
          <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
      </div>

      {/* Overview bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Primary Disciplines
          </div>
          <div className="text-sm font-semibold text-neutral-900 truncate">
            {(localExpertise.disciplines && localExpertise.disciplines.length > 0)
              ? localExpertise.disciplines.join(' & ')
              : localExpertise.field || 'UX Copywriting & Content Design'}
          </div>
          <div className="text-[11px] text-neutral-400">
            {localExpertise.disciplines?.length || 2} core field disciplines defined
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Intersecting Topics
          </div>
          <div className="text-sm font-semibold text-neutral-900">
            {activeTopicCount} of {(localExpertise.topics || []).length} topics active
          </div>
          <div className="text-[11px] text-neutral-400">
            Concept recognition across enabled topics
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Product References
          </div>
          <div className="text-sm font-semibold text-neutral-900">
            {activeProductCount} of {(localExpertise.productKnowledge || []).length} products active
          </div>
          <div className="text-[11px] text-neutral-400">
            Factual reference background notes
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
            Target Audience
          </div>
          <div className="text-sm font-semibold text-neutral-900 truncate">
            {localExpertise.audienceContext || 'Design Directors & Hiring Managers'}
          </div>
          <div className="text-[11px] text-neutral-400">
            Tailors vocabulary and level of technical depth
          </div>
        </div>
      </div>

      {/* Section 1 — Fields and audience */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-neutral-700" />
              <span>Fields and audience</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Specify the primary disciplines that frame your writing and portfolio case studies.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Disciplines Manager */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-800 block">
              Core Disciplines
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-neutral-50 rounded-lg border border-neutral-200">
              {(localExpertise.disciplines || ['UX Copywriting', 'Content Design']).map((disc) => (
                <span
                  key={disc}
                  className="inline-flex items-center gap-1.5 text-xs bg-white border border-neutral-300 text-neutral-800 px-2.5 py-1 rounded-md shadow-2xs font-medium"
                >
                  <span>{disc}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDiscipline(disc)}
                    className="text-neutral-400 hover:text-neutral-700"
                    title={`Remove ${disc}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                id="input-new-discipline"
                value={newDisciplineInput}
                onChange={(e) => setNewDisciplineInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDiscipline();
                  }
                }}
                placeholder="Add discipline (e.g. Design Systems, UX Research)"
                className="flex-1 text-xs px-3 py-1.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900 text-neutral-900"
              />
              <button
                type="button"
                id="btn-add-discipline"
                onClick={handleAddDiscipline}
                disabled={!newDisciplineInput.trim()}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Target Audience Context */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-800 block">
              Portfolio Audience Context
            </label>
            <textarea
              rows={3}
              id="input-domain-audience"
              value={localExpertise.audienceContext || ''}
              onChange={(e) => handleAudienceChange(e.target.value)}
              placeholder="e.g. Design directors, VP of Product, hiring managers, and design leads evaluating portfolio case studies."
              className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900 text-neutral-900 leading-relaxed"
            />
            <p className="text-[11px] text-neutral-400">
              Who reads this portfolio case study and their expected depth of product understanding.
            </p>
          </div>
        </div>
      </div>

      {/* Section 2 — Topics */}
      <DomainTopicsSection
        localExpertise={localExpertise}
        saveExpertise={saveExpertise}
        updateDomainExpertise={updateDomainExpertise}
        flashSaved={flashSaved}
        modelSettings={modelSettings}
        draftText={draftText}
        projectBrief={projectBrief}
        sourceUploadPending={sourceUploadPending}
        useDraftAndBrief={useDraftAndBrief}
        setUseDraftAndBrief={setUseDraftAndBrief}
        onEditDraftBrief={() => setActiveTab('draft-brief')}
      />

      {/* Section 3 — Products */}
      <DomainProductsSection
        localExpertise={localExpertise}
        saveExpertise={saveExpertise}
      />

      {/* Section 4 — Domain guidance */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Domain guidance
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Explain how to apply domain knowledge while keeping the draft’s facts and your voice intact.
            </p>
          </div>
        </div>

        <textarea
          rows={5}
          id="textarea-domain-guidelines"
          value={guidelinesText}
          onChange={(e) => handleGuidelinesChange(e.target.value)}
          placeholder="Name relevant concepts when they clarify a decision already described in the draft. Explain them in accessible language alongside the example."
          className="w-full text-xs p-3.5 bg-neutral-50/50 rounded-xl border border-neutral-200 focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-400 font-sans leading-relaxed resize-y"
        />

        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
          <span className="font-medium text-neutral-800 block text-[11px]">
            How domain and product knowledge are integrated:
          </span>
          <p className="leading-relaxed text-[11px] text-neutral-500">
            Domain knowledge helps explain the thinking already present in your draft. Product notes provide context for names and capabilities. Both guide the model; the draft and brief remain the sources for claims and outcomes.
          </p>
        </div>
      </div>

      {/* Step Footer */}
      <StepFooter
        label="Next: Rewrite Studio →"
        id="btn-domain-to-studio"
        onClick={() => setActiveTab('studio')}
      />
    </div>
  );
};

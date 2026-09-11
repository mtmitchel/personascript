import React, { useState, useRef, useEffect } from 'react';
import { DomainExpertise, DomainTopic } from '../types';
import {
  Sparkles,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  DollarSign,
  Globe,
  Bot,
  BookOpen,
  Layers,
} from 'lucide-react';

interface DomainTopicsSectionProps {
  localExpertise: DomainExpertise;
  saveExpertise: (updated: DomainExpertise) => void;
  updateDomainExpertise: (updater: (prev: DomainExpertise) => DomainExpertise) => void;
  flashSaved: () => void;
  modelSettings: { analysisModel?: string; analysisReasoningLevel?: string };
  draftText: string;
  projectBrief: string;
  sourceUploadPending: boolean;
  useDraftAndBrief: boolean;
  setUseDraftAndBrief: (val: boolean) => void;
  onEditDraftBrief: () => void;
}

export const DomainTopicsSection: React.FC<DomainTopicsSectionProps> = ({
  localExpertise,
  saveExpertise,
  updateDomainExpertise,
  flashSaved,
  modelSettings,
  draftText,
  projectBrief,
  sourceUploadPending,
  useDraftAndBrief,
  setUseDraftAndBrief,
  onEditDraftBrief,
}) => {
  const generationBusy = useRef(false);
  const generationController = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTopicId, setGeneratingTopicId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [topicGenerationError, setTopicGenerationError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => () => generationController.current?.abort(), []);

  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState<'discipline' | 'intersecting'>('intersecting');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [newTopicTerms, setNewTopicTerms] = useState('');
  const [newTopicConventions, setNewTopicConventions] = useState('');

  const [topicTermInputs, setTopicTermInputs] = useState<Record<string, string>>({});

  const topicsList = localExpertise.topics || [];
  const hasTopics = topicsList.length > 0;
  const activeTopicCount = topicsList.filter((t) => t.enabled).length;

  const handleToggleTopic = (topicId: string) => {
    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((t) =>
      t.id === topicId ? { ...t, enabled: !t.enabled } : t
    );
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleAddTermToTopic = (topicId: string) => {
    const raw = (topicTermInputs[topicId] || '').trim();
    if (!raw) return;

    const newTerms = raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      const existing = topic.keyTerminology || [];
      const added = newTerms.filter((term) => !existing.includes(term));
      return {
        ...topic,
        keyTerminology: [...existing, ...added],
      };
    });

    setTopicTermInputs((prev) => ({ ...prev, [topicId]: '' }));
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleRemoveTermFromTopic = (topicId: string, termToRemove: string) => {
    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      const remainingTerms = (topic.keyTerminology || []).filter((t) => t !== termToRemove);
      let updatedAnnotations = topic.conceptAnnotations ? { ...topic.conceptAnnotations } : undefined;
      if (updatedAnnotations) {
        delete updatedAnnotations[termToRemove];
        delete updatedAnnotations[termToRemove.toLowerCase()];
      }
      return {
        ...topic,
        keyTerminology: remainingTerms,
        conceptAnnotations: updatedAnnotations && Object.keys(updatedAnnotations).length > 0 ? updatedAnnotations : undefined,
      };
    });
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleAddConventionToTopic = (topicId: string) => {
    const rule = window.prompt('Enter new rule or convention for this topic:');
    if (!rule || !rule.trim()) return;

    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      return {
        ...topic,
        conventions: [...(topic.conventions || []), rule.trim()],
      };
    });

    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleRemoveConventionFromTopic = (topicId: string, index: number) => {
    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      const filtered = (topic.conventions || []).filter((_, i) => i !== index);
      return {
        ...topic,
        conventions: filtered,
      };
    });

    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    const terms = newTopicTerms
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const conventions = newTopicConventions
      .split('\n')
      .map((c) => c.trim().replace(/^[•\-\*]\s*/, ''))
      .filter(Boolean);

    const newTopic: DomainTopic = {
      id: `topic-${Date.now()}`,
      name: newTopicName.trim(),
      category: newTopicCategory,
      description: newTopicDesc.trim() || undefined,
      keyTerminology: terms,
      conventions: conventions,
      enabled: true,
    };

    const updatedTopics = [...(localExpertise.topics || []), newTopic];
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });

    setNewTopicName('');
    setNewTopicDesc('');
    setNewTopicTerms('');
    setNewTopicConventions('');
    setIsAddingTopic(false);
  };

  const handleDeleteTopic = (topicId: string) => {
    const target = (localExpertise.topics || []).find((t) => t.id === topicId);
    const label = target?.name ? ` "${target.name}"` : '';
    if (!window.confirm(`Delete topic${label}? This cannot be undone.`)) return;

    const updatedTopics = (localExpertise.topics || []).filter((t) => t.id !== topicId);
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  const handleGenerateKnowledge = async (targetTopic?: DomainTopic) => {
    if (generationBusy.current || sourceUploadPending) return;
    generationBusy.current = true;
    const controller = new AbortController();
    generationController.current = controller;
    if (targetTopic) {
      setGeneratingTopicId(targetTopic.id);
      setTopicGenerationError(null);
    } else {
      setIsGenerating(true);
      setGenerationError(null);
    }

    try {
      const existingTopicNames = (localExpertise.topics || [])
        .map((t) => t.name)
        .filter(Boolean);

      const requestBody: Record<string, unknown> = {
        field: localExpertise.field || (localExpertise.disciplines || []).join(' & '),
        disciplines: localExpertise.disciplines || [],
        existingTopics: targetTopic ? [] : existingTopicNames,
        targetTopic: targetTopic ? { name: targetTopic.name, category: targetTopic.category === 'discipline' ? 'discipline' : 'intersecting' } : undefined,
        model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
        reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
      };

      if (useDraftAndBrief) {
        if (draftText.trim()) requestBody.draft = draftText;
        if (projectBrief.trim()) requestBody.projectBrief = projectBrief;
      }

      const res = await fetch('/api/generate-domain-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate domain knowledge');
      }

      const { topics: newTopics } = await res.json();
      if (!Array.isArray(newTopics) || newTopics.length === 0) {
        throw new Error('No domain topics returned by the server.');
      }

      if (controller.signal.aborted) return;
      if (targetTopic) {
        if (newTopics.length !== 1 || newTopics[0].name !== targetTopic.name.trim() ||
            newTopics[0].category !== (targetTopic.category === 'discipline' ? 'discipline' : 'intersecting')) {
          throw new Error('The model did not return the requested card. Your card has been kept.');
        }
        updateDomainExpertise((prev) => ({
          ...prev,
          topics: (prev.topics || []).map((topic) => topic.id === targetTopic.id
            ? {
                ...topic,
                description: newTopics[0].description,
                keyTerminology: newTopics[0].keyTerminology,
                conceptAnnotations: newTopics[0].conceptAnnotations,
                conventions: newTopics[0].conventions,
              }
            : topic),
        }));
      } else {
        updateDomainExpertise((prev) => ({
          ...prev,
          topics: newTopics,
          keyTerminology: [],
          conventions: [],
        }));
      }
      flashSaved();
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const message = err.message || 'Failed to generate domain knowledge';
      if (targetTopic) setTopicGenerationError({ id: targetTopic.id, message });
      else setGenerationError(message);
    } finally {
      generationBusy.current = false;
      generationController.current = null;
      setIsGenerating(false);
      setGeneratingTopicId(null);
    }
  };

  const handleClearTopic = (topicId: string) => {
    if (isGenerating || generatingTopicId === topicId) return;
    const target = (localExpertise.topics || []).find((t) => t.id === topicId);
    const label = target?.name ? ` "${target.name}"` : '';
    if (!window.confirm(`Clear concepts and conventions for topic${label}?`)) return;

    setTopicGenerationError((prev) => prev?.id === topicId ? null : prev);
    setTopicTermInputs((prev) => ({ ...prev, [topicId]: '' }));
    updateDomainExpertise((prev) => ({
      ...prev,
      topics: (prev.topics || []).map((topic) => topic.id === topicId
        ? { ...topic, description: undefined, keyTerminology: [], conceptAnnotations: undefined, conventions: [] }
        : topic),
    }));
    flashSaved();
  };

  const handleClearTopics = () => {
    if (generationBusy.current) return;
    if (!window.confirm('Remove all topics? This cannot be undone.')) return;
    setGenerationError(null);
    const updated: DomainExpertise = {
      ...localExpertise,
      topics: [],
      keyTerminology: [],
      conventions: [],
    };
    saveExpertise(updated);
  };

  const getTopicIcon = (name: string, category?: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('monetiz') || lower.includes('pricing') || lower.includes('conversion')) {
      return <DollarSign className="w-3.5 h-3.5 text-emerald-600" />;
    }
    if (lower.includes('translation') || lower.includes('localiz') || lower.includes('i18n')) {
      return <Globe className="w-3.5 h-3.5 text-sky-600" />;
    }
    if (lower.includes('writing assist') || lower.includes('ai') || lower.includes('bot')) {
      return <Bot className="w-3.5 h-3.5 text-amber-600" />;
    }
    if (category === 'discipline' || lower.includes('copywriting') || lower.includes('content design')) {
      return <BookOpen className="w-3.5 h-3.5 text-neutral-800" />;
    }
    return <Layers className="w-3.5 h-3.5 text-neutral-600" />;
  };

  return (
    <div className={`space-y-4 transition-opacity ${!localExpertise.enabled ? 'opacity-50' : ''}`}>
      {/* Topics Header Row */}
      <div className="space-y-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neutral-800" />
              <span>Topics</span>
            </h2>
            <span className="text-xs text-neutral-500">
              ({activeTopicCount} of {topicsList.length} enabled)
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            {hasTopics && (
              <>
                <button
                  type="button"
                  id="btn-regenerate-topics"
                  disabled={isGenerating || generatingTopicId !== null || sourceUploadPending}
                  onClick={() => handleGenerateKnowledge()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-50"
                  title="Regenerate topics and concepts from your configured fields"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-white ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{isGenerating ? 'Generating…' : 'Regenerate topics'}</span>
                </button>

                <div className="flex items-center gap-1.5 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    id="checkbox-use-draft-brief"
                    checked={useDraftAndBrief}
                    disabled={isGenerating || generatingTopicId !== null}
                    onChange={(e) => setUseDraftAndBrief(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer shrink-0"
                  />
                  <label htmlFor="checkbox-use-draft-brief" className="cursor-pointer font-medium select-none">
                    Use my draft and brief
                  </label>
                  <button
                    type="button"
                    id="btn-link-edit-draft-brief"
                    onClick={onEditDraftBrief}
                    className="text-neutral-500 hover:text-neutral-800 underline ml-0.5 text-xs"
                  >
                    Edit in Draft &amp; Brief
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              id="btn-open-add-topic"
              disabled={isGenerating}
              onClick={() => setIsAddingTopic(!isAddingTopic)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-600" />
              <span>Add topic</span>
            </button>

            {hasTopics && (
              <button
                type="button"
                id="btn-clear-topics"
                disabled={isGenerating || generatingTopicId !== null}
                onClick={handleClearTopics}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium ml-auto sm:ml-2 sm:pl-4 sm:border-l sm:border-neutral-200 transition disabled:opacity-50"
              >
                Clear all topics
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Concepts are examples to recognize when relevant, not a list of words to include.
        </p>
      </div>

      {sourceUploadPending && (
        <p role="status" className="text-xs text-neutral-600">
          Waiting for draft and brief uploads to finish before generating concepts.
        </p>
      )}

      {generationError && (
        <div
          id="domain-generation-error"
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{generationError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGenerationError(null)}
            className="text-rose-500 hover:text-rose-700 p-1 rounded"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add New Topic Form */}
      {isAddingTopic && (
        <form
          onSubmit={handleCreateTopic}
          className="p-4 rounded-xl bg-neutral-50 border border-neutral-300 space-y-3.5 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-900">Add topic</h3>
            <button
              type="button"
              onClick={() => setIsAddingTopic(false)}
              aria-label="Close add topic form"
              className="text-neutral-400 hover:text-neutral-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                Topic name
              </label>
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="e.g. Growth Experimentation & A/B Testing"
                className="w-full text-xs px-3 py-1.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900"
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                Category
              </label>
              <select
                value={newTopicCategory}
                onChange={(e) => setNewTopicCategory(e.target.value as any)}
                className="w-full text-xs px-3 py-1.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900"
              >
                <option value="intersecting">Intersecting Topic</option>
                <option value="discipline">Core Discipline</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-neutral-700 block mb-1">
              Short description
            </label>
            <input
              type="text"
              value={newTopicDesc}
              onChange={(e) => setNewTopicDesc(e.target.value)}
              placeholder="e.g. Conversion funnels, hypothesis testing, uplift metrics, sample size"
              className="w-full text-xs px-3 py-1.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                Concept examples (comma-separated)
              </label>
              <input
                type="text"
                value={newTopicTerms}
                onChange={(e) => setNewTopicTerms(e.target.value)}
                placeholder="statistical significance, variance, primary metric, baseline"
                className="w-full text-xs px-3 py-1.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                Conventions &amp; rules (one per line)
              </label>
              <textarea
                rows={2}
                value={newTopicConventions}
                onChange={(e) => setNewTopicConventions(e.target.value)}
                placeholder="Always report both relative and absolute uplift&#10;Tie microcopy changes to behavioral metrics"
                className="w-full text-xs p-2 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingTopic(false)}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium shadow-2xs"
            >
              Save topic
            </button>
          </div>
        </form>
      )}

      {/* Empty state: rendered when no topics */}
      {!hasTopics ? (
        <div className="p-8 rounded-xl bg-neutral-50/70 border border-dashed border-neutral-300 text-center space-y-4">
          <Sparkles className="w-6 h-6 text-neutral-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-neutral-800">
              No domain topics generated yet
            </h3>
            <p className="text-[11px] text-neutral-500 max-w-md mx-auto leading-relaxed">
              Generate broad domain disciplines, intersecting topics, and concept examples based on your configured core disciplines above. You can also add topics manually.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              type="button"
              id="btn-regenerate-topics"
              disabled={isGenerating || sourceUploadPending}
              onClick={() => handleGenerateKnowledge()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition shadow-xs disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Generating…' : 'Generate topics'}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-neutral-700">
              <input
                type="checkbox"
                id="checkbox-use-draft-brief"
                checked={useDraftAndBrief}
                disabled={isGenerating}
                onChange={(e) => setUseDraftAndBrief(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer shrink-0"
              />
              <label htmlFor="checkbox-use-draft-brief" className="cursor-pointer font-medium select-none">
                Use my draft and brief
              </label>
              <button
                type="button"
                id="btn-link-edit-draft-brief"
                onClick={onEditDraftBrief}
                className="text-neutral-500 hover:text-neutral-800 underline ml-0.5 text-xs"
              >
                Edit in Draft &amp; Brief
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topicsList.map((topic) => {
            const termInputVal = topicTermInputs[topic.id] || '';

            return (
              <details
                key={topic.id}
                id={`topic-card-${topic.id}`}
                aria-label={topic.name}
                className={`group min-w-0 rounded-xl border transition-all duration-200 p-4 space-y-3.5 ${
                  topic.enabled
                    ? 'bg-white border-neutral-300 shadow-xs'
                    : 'bg-neutral-50/80 border-neutral-200 opacity-60 hover:opacity-100'
                }`}
              >
                {/* Summary / Header (visible always; counts visible when closed) */}
                <summary className="list-none cursor-pointer flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        id={`check-topic-${topic.id}`}
                        checked={topic.enabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleToggleTopic(topic.id)}
                        className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="p-1 rounded bg-neutral-100 border border-neutral-200 shrink-0">
                            {getTopicIcon(topic.name, topic.category)}
                          </span>
                          <label
                            htmlFor={`check-topic-${topic.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-semibold text-neutral-900 cursor-pointer hover:underline truncate"
                          >
                            {topic.name}
                          </label>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                              topic.category === 'discipline'
                                ? 'bg-neutral-100 text-neutral-800 border-neutral-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {topic.category === 'discipline' ? 'Core Field' : 'Intersecting Topic'}
                          </span>
                        </div>

                        {topic.description && (
                          <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                            {topic.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        id={`btn-regenerate-topic-${topic.id}`}
                        aria-label={`Regenerate ${topic.name}`}
                        disabled={generatingTopicId !== null || sourceUploadPending}
                        onClick={() => handleGenerateKnowledge(topic)}
                        className="text-xs text-neutral-600 hover:text-neutral-900 font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${generatingTopicId === topic.id ? 'animate-spin' : ''}`} />
                        <span>{generatingTopicId === topic.id ? 'Regenerating…' : 'Regenerate'}</span>
                      </button>
                      <button
                        type="button"
                        id={`btn-clear-topic-${topic.id}`}
                        aria-label={`Clear ${topic.name}`}
                        onClick={() => handleClearTopic(topic.id)}
                        disabled={!topic.description && !topic.keyTerminology?.length && !topic.conventions?.length}
                        className="text-xs text-neutral-600 hover:text-neutral-900 font-medium disabled:opacity-50"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTopic(topic.id)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                      >
                        Delete
                      </button>
                      <ChevronDown className="w-4 h-4 text-neutral-400 group-open:rotate-180 transition-transform ml-1" />
                    </div>
                  </div>

                  {/* Summary line visible when collapsed */}
                  <div className="group-open:hidden text-[11px] text-neutral-400 font-mono pl-6.5">
                    {(topic.keyTerminology || []).length} concepts · {(topic.conventions || []).length} conventions
                  </div>
                </summary>

                {topicGenerationError?.id === topic.id && (
                  <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                    {topicGenerationError.message}
                  </p>
                )}

                {/* Card Body (revealed when details is opened) */}
                <div className="space-y-3.5 pt-2 border-t border-neutral-100">
                  {/* Terminology Tags */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-neutral-700">Concept examples</span>
                      <span className="text-neutral-400 font-mono">
                        {(topic.keyTerminology || []).length} concepts
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {(topic.keyTerminology || []).map((term) => {
                        const annotation = topic.conceptAnnotations?.[term] || topic.conceptAnnotations?.[term.toLowerCase()];
                        const isSupported = annotation?.status === 'supported';
                        const isAdjacent = annotation?.status === 'adjacent';

                        let badgeClass = 'bg-neutral-100 text-neutral-700 border-neutral-200';
                        if (isSupported) {
                          badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                        } else if (isAdjacent) {
                          badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                        }

                        return (
                          <span
                            key={term}
                            title={annotation?.explanation || (isSupported ? 'Supported concept' : isAdjacent ? 'Adjacent suggestion' : undefined)}
                            className={`inline-flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded-md ${badgeClass}`}
                          >
                            {isSupported && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                            {isAdjacent && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                            <span>{term}</span>
                            {isSupported && <span className="text-[9px] text-emerald-600 font-normal">(supported)</span>}
                            {isAdjacent && <span className="text-[9px] text-amber-600 font-normal">(adjacent)</span>}
                            <button
                              type="button"
                              onClick={() => handleRemoveTermFromTopic(topic.id, term)}
                              className="text-neutral-400 hover:text-neutral-700 ml-0.5"
                              title={`Remove ${term}`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    {topic.conceptAnnotations && Object.keys(topic.conceptAnnotations).length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] text-neutral-500 font-medium">Concept relevance:</div>
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {topic.keyTerminology.map((conceptTerm) => {
                            const annot = topic.conceptAnnotations?.[conceptTerm];
                            if (!annot) return null;
                            return (
                              <div key={conceptTerm} className="text-[10px] leading-snug flex items-start gap-1.5 text-neutral-600">
                                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${annot.status === 'supported' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <span>
                                  <strong className="text-neutral-800">{conceptTerm}:</strong> {annot.explanation || (annot.status === 'supported' ? 'Demonstrated in source draft or brief.' : 'Related adjacent concept.')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Add term inline */}
                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="text"
                        value={termInputVal}
                        onChange={(e) =>
                          setTopicTermInputs({ ...topicTermInputs, [topic.id]: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTermToTopic(topic.id);
                          }
                        }}
                        placeholder="Add concept (e.g. information hierarchy, comprehension)"
                        className="flex-1 text-[11px] px-2 py-1 bg-white rounded border border-neutral-200 focus:outline-none focus:border-neutral-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTermToTopic(topic.id)}
                        disabled={!termInputVal.trim()}
                        aria-label="Add concept"
                        className="px-2 py-1 rounded border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-[11px] font-medium transition disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Conventions & Writing Rules (all rendered, no +N more) */}
                  <div className="space-y-1 pt-1 border-t border-neutral-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-neutral-700">Writing Rules &amp; Conventions</span>
                      <button
                        type="button"
                        onClick={() => handleAddConventionToTopic(topic.id)}
                        className="text-neutral-500 hover:text-neutral-900 flex items-center gap-0.5 font-medium"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Add rule</span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      {(topic.conventions || []).map((conv, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 text-[11px] text-neutral-600 bg-neutral-50/70 p-1.5 rounded border border-neutral-150 leading-relaxed"
                        >
                          <span className="flex-1">• {conv}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveConventionFromTopic(topic.id, idx)}
                            aria-label={`Remove rule: ${conv}`}
                            className="text-neutral-300 hover:text-neutral-600 shrink-0 mt-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};

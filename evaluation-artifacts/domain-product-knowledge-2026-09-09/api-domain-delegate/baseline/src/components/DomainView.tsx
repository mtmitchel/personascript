import React, { useState, useEffect } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DomainExpertise, DomainTopic, ProductReference } from '../types';
import {
  Plus,
  X,
  ArrowRight,
  Check,
  ListPlus,
  Sparkles,
  Layers,
  Globe,
  DollarSign,
  Cpu,
  Bot,
  Sliders,
  RotateCcw,
  Tag,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Package,
} from 'lucide-react';
import { UX_PORTFOLIO_PRESET, SYSTEMS_ENGINEERING_PRESET, presetToDomainExpertise } from '../data/domainPresets';
import { normalizeDomainExpertise } from '../writingPipeline';

export const DomainView: React.FC = () => {
  const {
    domainExpertise,
    updateDomainExpertise,
    setActiveTab,
  } = useWritingAssistant();

  const [localExpertise, setLocalExpertise] = useState<DomainExpertise>(() => {
    return normalizeDomainExpertise(domainExpertise);
  });

  const [newDisciplineInput, setNewDisciplineInput] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Quick state for adding a new topic
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState<'discipline' | 'intersecting'>('intersecting');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [newTopicTerms, setNewTopicTerms] = useState('');
  const [newTopicConventions, setNewTopicConventions] = useState('');

  // Per-topic inline term input states: { [topicId]: string }
  const [topicTermInputs, setTopicTermInputs] = useState<Record<string, string>>({});
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(new Set());

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

  // Toggle a topic on/off
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

  // Add term to a specific topic
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

  // Remove term from a specific topic
  const handleRemoveTermFromTopic = (topicId: string, termToRemove: string) => {
    const currentTopics = localExpertise.topics || [];
    const updatedTopics = currentTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      return {
        ...topic,
        keyTerminology: (topic.keyTerminology || []).filter((t) => t !== termToRemove),
      };
    });
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  // Add convention to a specific topic
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

  // Remove convention from a specific topic
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

  // Create new custom topic
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

    // Reset creator state
    setNewTopicName('');
    setNewTopicDesc('');
    setNewTopicTerms('');
    setNewTopicConventions('');
    setIsAddingTopic(false);
  };

  // Delete a topic
  const handleDeleteTopic = (topicId: string) => {
    const updatedTopics = (localExpertise.topics || []).filter((t) => t.id !== topicId);
    saveExpertise({
      ...localExpertise,
      topics: updatedTopics,
    });
  };

  // Product reference knowledge management
  const handleAddProduct = () => {
    const newProduct: ProductReference = {
      id: `product-${crypto.randomUUID()}`,
      name: '',
      notes: '',
      enabled: true,
    };
    saveExpertise({
      ...localExpertise,
      productKnowledge: [...(localExpertise.productKnowledge || []), newProduct],
    });
  };

  const handleUpdateProduct = (id: string, updates: Partial<ProductReference>) => {
    const updated = (localExpertise.productKnowledge || []).map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    saveExpertise({
      ...localExpertise,
      productKnowledge: updated,
    });
  };

  const handleDeleteProduct = (id: string) => {
    const updated = (localExpertise.productKnowledge || []).filter((p) => p.id !== id);
    saveExpertise({
      ...localExpertise,
      productKnowledge: updated,
    });
  };

  // Load preset
  const handleApplyPreset = (preset: typeof UX_PORTFOLIO_PRESET) => {
    const configured = presetToDomainExpertise(preset, localExpertise.productKnowledge);
    setLocalExpertise(configured);
    updateDomainExpertise(configured);
    if (configured.customNotes) {
      setGuidelinesText(configured.customNotes);
    }
    flashSaved();
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

  const activeTopicCount = (localExpertise.topics || []).filter((t) => t.enabled).length;
  const activeProductCount = (localExpertise.productKnowledge || []).filter((p) => p.enabled).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
              Domain & Product Knowledge
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
              {localExpertise.enabled ? 'Knowledge enabled' : 'Knowledge off'}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Help the model recognize relevant ideas in your draft and understand the products you describe.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer select-none">
            <input
              id="toggle-domain-enable"
              type="checkbox"
              checked={localExpertise.enabled}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900"
            />
            <div className="flex flex-col">
              <span className="font-medium">Active in rewrites</span>
              <span className="text-[10px] text-neutral-400">Controls all domain topics and product references</span>
            </div>
          </label>

          {savedFeedback && (
            <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}

          <button
            id="btn-apply-ux-preset"
            type="button"
            onClick={() => handleApplyPreset(UX_PORTFOLIO_PRESET)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition"
            title="Reset to default UX Portfolio configuration"
          >
            <RotateCcw className="w-3 h-3 text-neutral-500" />
            <span>Load UX Portfolio Preset</span>
          </button>

          <button
            id="btn-domain-to-studio"
            type="button"
            onClick={() => setActiveTab('studio')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
          >
            <span>Rewrite Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top Overview Bar */}
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

      {/* Disciplines & Target Audience Row */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-neutral-700" />
              <span>Core Disciplines & Audience Context</span>
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
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-40 flex items-center gap-1"
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
              className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900 text-neutral-900 resize-none leading-relaxed"
            />
            <p className="text-[11px] text-neutral-400">
              Who reads this portfolio case study and their expected depth of product understanding.
            </p>
          </div>
        </div>
      </div>

      {/* Intersecting Fields & Topics Cards */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neutral-800" />
              <span>Intersecting Fields, Disciplines & Topics</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Choose the fields the model should draw on. Concepts are examples to recognize when relevant, not a list of words to include.
            </p>
          </div>

          <button
            type="button"
            id="btn-open-add-topic"
            onClick={() => setIsAddingTopic(!isAddingTopic)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs self-start"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-600" />
            <span>Add field or topic</span>
          </button>
        </div>

        {/* Add New Topic Form */}
        {isAddingTopic && (
          <form
            onSubmit={handleCreateTopic}
            className="p-4 rounded-xl bg-neutral-50 border border-neutral-300 space-y-3.5 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-900">Add New Topic or Discipline</h3>
              <button
                type="button"
                onClick={() => setIsAddingTopic(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Topic Name
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
                Short Description
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
                  Conventions & Rules (one per line)
                </label>
                <textarea
                  rows={2}
                  value={newTopicConventions}
                  onChange={(e) => setNewTopicConventions(e.target.value)}
                  placeholder="Always report both relative and absolute uplift&#10;Tie microcopy changes to behavioral metrics"
                  className="w-full text-xs p-2 bg-white rounded-lg border border-neutral-200 focus:outline-none focus:border-neutral-900 resize-none"
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
                className="px-3.5 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800"
              >
                Save Topic
              </button>
            </div>
          </form>
        )}

        {/* Topics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(localExpertise.topics || []).map((topic) => {
            const isExpanded = expandedTopicIds.has(topic.id);
            const termInputVal = topicTermInputs[topic.id] || '';

            return (
              <div
                key={topic.id}
                className={`rounded-xl border transition-all duration-200 p-4 space-y-3.5 ${
                  topic.enabled
                    ? 'bg-white border-neutral-300 shadow-xs'
                    : 'bg-neutral-50/80 border-neutral-200 opacity-60 hover:opacity-100'
                }`}
              >
                {/* Topic Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      id={`check-topic-${topic.id}`}
                      checked={topic.enabled}
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

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTopicIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(topic.id)) next.delete(topic.id);
                          else next.add(topic.id);
                          return next;
                        })
                      }
                      className="text-neutral-400 hover:text-neutral-700 p-1 rounded"
                      title={isExpanded ? 'Collapse conventions' : 'Expand conventions'}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTopic(topic.id)}
                      className="text-neutral-300 hover:text-rose-600 p-1 rounded transition"
                      title="Delete topic"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Terminology Tags */}
                <div className="space-y-1.5 pt-1 border-t border-neutral-100">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-neutral-700">Concept examples</span>
                    <span className="text-neutral-400 font-mono">
                      {(topic.keyTerminology || []).length} concepts
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(topic.keyTerminology || []).map((term) => (
                      <span
                        key={term}
                        className="inline-flex items-center gap-1 text-[10px] bg-neutral-100 text-neutral-700 border border-neutral-200 px-1.5 py-0.5 rounded-md"
                      >
                        <span>{term}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTermFromTopic(topic.id, term)}
                          className="text-neutral-400 hover:text-neutral-700"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>

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
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-medium transition disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Conventions & Writing Rules */}
                <div className="space-y-1 pt-1 border-t border-neutral-100">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-neutral-700">Writing Rules & Conventions</span>
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
                    {(topic.conventions || []).slice(0, isExpanded ? undefined : 2).map((conv, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-2 text-[11px] text-neutral-600 bg-neutral-50/70 p-1.5 rounded border border-neutral-150 leading-relaxed"
                      >
                        <span className="flex-1">• {conv}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveConventionFromTopic(topic.id, idx)}
                          className="text-neutral-300 hover:text-neutral-600 shrink-0 mt-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {!isExpanded && (topic.conventions || []).length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTopicIds((prev) => new Set([...prev, topic.id]))
                        }
                        className="text-[10px] text-neutral-500 hover:text-neutral-900 font-medium"
                      >
                        + {(topic.conventions || []).length - 2} more rules (click to expand)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product Knowledge Reference Section */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-neutral-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-neutral-800" />
              <h2 className="text-base font-semibold text-neutral-900">Product knowledge</h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                Reference notes
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
              Add what the model should know about a product. Include sources and dates when they matter. Enable the references relevant to your draft.
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              These notes help interpret product details. The review can flag possible conflicts; check its suggestions before changing facts.
            </p>
          </div>

          <button
            type="button"
            id="btn-add-product"
            onClick={handleAddProduct}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs shrink-0 self-start"
          >
            <Plus className="w-3.5 h-3.5 text-neutral-600" />
            <span>Add product</span>
          </button>
        </div>

        {(!localExpertise.productKnowledge || localExpertise.productKnowledge.length === 0) ? (
          <div className="p-6 rounded-xl bg-neutral-50/70 border border-dashed border-neutral-300 text-center space-y-2">
            <Package className="w-6 h-6 text-neutral-500 mx-auto" />
            <div className="text-xs font-medium text-neutral-700">No product references added yet</div>
            <p className="text-[11px] text-neutral-500 max-w-md mx-auto">
              Add a product, such as DeepL Translator or DeepL Write, and describe what it does.
            </p>
            <button
              type="button"
              id="btn-add-first-product"
              onClick={handleAddProduct}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-600" />
              <span>Add product entry</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {localExpertise.productKnowledge.map((product) => (
              <div
                key={product.id}
                className={`p-4 rounded-xl border transition-all ${
                  product.enabled
                    ? 'bg-white border-neutral-300 shadow-xs'
                    : 'bg-neutral-50/70 border-neutral-200 '
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      id={`toggle-product-${product.id}`}
                      aria-label={`Enable product ${product.name || 'entry'}`}
                      checked={product.enabled}
                      onChange={(e) => handleUpdateProduct(product.id, { enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 accent-neutral-900 cursor-pointer"
                    />
                    <input
                      type="text"
                      id={`product-name-${product.id}`}
                      aria-label="Product name"
                      value={product.name}
                      onChange={(e) => handleUpdateProduct(product.id, { name: e.target.value })}
                      placeholder="e.g. DeepL Translator"
                      className="text-xs font-semibold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-neutral-900 focus:outline-none px-1 py-0.5 w-full max-w-sm"
                    />
                  </div>

                  <button
                    type="button"
                    id={`btn-delete-product-${product.id}`}
                    aria-label={`Remove product ${product.name || 'entry'}`}
                    onClick={() => handleDeleteProduct(product.id)}
                    className="text-neutral-500 hover:text-rose-600 p-1 rounded transition"
                    title="Remove product entry"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2.5 pl-6.5">
                  <label htmlFor={`product-notes-${product.id}`} className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Reference notes
                  </label>
                  <textarea
                    id={`product-notes-${product.id}`}
                    aria-label="Reference notes"
                    rows={4}
                    value={product.notes}
                    onChange={(e) => handleUpdateProduct(product.id, { notes: e.target.value })}
                    placeholder="What does this product do? Add relevant features, naming, sources, and dates."
                    className="w-full text-xs p-2 bg-neutral-50 rounded-lg border border-neutral-200 focus:bg-white focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 resize-y leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global Guidelines & Nuances */}
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
            Domain knowledge helps explain the thinking already present in your draft. Product notes provide context for names and capabilities. Both guide the model; the original draft remains the source for claims and outcomes.
          </p>
        </div>
      </div>
    </div>
  );
};

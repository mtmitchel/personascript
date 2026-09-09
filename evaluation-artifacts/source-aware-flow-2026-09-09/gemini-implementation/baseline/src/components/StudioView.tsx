import React, { useState, useRef } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { ToneSlidersControl } from './ToneSlidersControl';
import { DiffViewer } from './DiffViewer';
import { StyleSimilarityCard } from './StyleSimilarityCard';
import { RewriteFeedbackManager } from './RewriteFeedbackManager';
import { ModelSelector } from './ModelSelector';
import { PreservationSettings, RewriteIntensity, SelectionRange } from '../types';
import { hasFreshProfileGuidance, PROJECT_BRIEF_MAX_CHARS } from '../writingPipeline';
import {
  FileText,
  Copy,
  Check,
  Download,
  GitCompare,
  Columns,
  RefreshCw,
  Database,
  Sliders,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Cpu,
  BrainCircuit,
} from 'lucide-react';

export const StudioView: React.FC = () => {
  const {
    samples,
    draftText,
    setDraftText,
    projectBrief,
    setProjectBrief,
    isUploadingBrief,
    briefUploadError,
    uploadProjectBrief,
    rewriteIntensity,
    setRewriteIntensity,
    toneAdjustments,
    setToneAdjustments,
    resetToneAdjustments,
    preservationLocks,
    setPreservationLocks,
    preservationSettings,
    updatePreservationSettings,
    customDirectives,
    setCustomDirectives,
    performRewrite,
    isRewriting,
    rewriteResult,
    activeProfile,
    domainExpertise,
    updateDomainExpertise,
    setActiveTab,
    applyQuickRefine,
    modelSettings,
  } = useWritingAssistant();

  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'diff' | 'side-by-side' | 'final'>('final');
  const [isRefining, setIsRefining] = useState(false);
  const [customRefineInput, setCustomRefineInput] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState('');
  const [selectedRange, setSelectedRange] = useState<SelectionRange | undefined>();
  const [showAdvancedLocks, setShowAdvancedLocks] = useState(false);
  const [showModelControls, setShowModelControls] = useState(false);
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  const modelDisplayNames: Record<string, string> = {
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  };
  const currentModelName = modelDisplayNames[modelSettings.model] || modelSettings.model;
  const currentReasoningLabel =
    modelSettings.reasoningLevel.charAt(0).toUpperCase() + modelSettings.reasoningLevel.slice(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const briefFileInputRef = useRef<HTMLInputElement | null>(null);
  const rewrittenProseRef = useRef<HTMLDivElement | null>(null);

  const wordCountOriginal = draftText.trim() ? draftText.trim().split(/\s+/).length : 0;
  const wordCountBrief = projectBrief.trim() ? projectBrief.trim().split(/\s+/).length : 0;
  const wordCountSource = rewriteResult?.originalText.trim()
    ? rewriteResult.originalText.trim().split(/\s+/).length
    : 0;
  const wordCountRewritten = rewriteResult?.rewrittenText.trim()
    ? rewriteResult.rewrittenText.trim().split(/\s+/).length
    : 0;
  const enabledSamples = samples
    .filter((sample) => sample.enabled)
    .map(({ id, title, content, enabled }) => ({ id, title, content, enabled }));
  const hasFreshBlueprint = hasFreshProfileGuidance(activeProfile, enabledSamples);

  const standardPreserveOptions: Array<{
    label: string;
    key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes'>;
  }> = [
    { label: 'Names & technical terms', key: 'preserveTerms' },
    { label: 'Numbers & data points', key: 'preserveNumbers' },
    { label: 'Direct quotes', key: 'preserveQuotes' },
  ];

  const togglePreserveOption = (key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes'>) => {
    updatePreservationSettings({ [key]: !preservationSettings[key] });
  };

  const handleCopy = () => {
    if (!rewriteResult?.rewrittenText) return;
    navigator.clipboard.writeText(rewriteResult.rewrittenText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'txt' | 'md') => {
    if (!rewriteResult?.rewrittenText) return;
    const blob = new Blob([rewriteResult.rewrittenText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rewritten-draft.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadSampleDraft = () => {
    setDraftText(
      `Per our previous sync, I am circling back regarding the Q3 product roadmap deliverables. Moving forward, we need to leverage cross-functional synergies to optimize operational bandwidth. It is critical that all stakeholders align on the core KPIs prior to the end of the month. Furthermore, multiple pain points have been identified in the existing deployment paradigm that necessitate a paradigm shift. Please find attached the deck outlining our go-forward strategy. Let me know if you have any questions or feedback.`
    );
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    const extractedTexts: string[] = [];

    for (const file of fileList) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let detectedType = 'txt';
      if (extension === 'pdf') detectedType = 'pdf';
      else if (extension === 'docx') detectedType = 'docx';
      else if (extension === 'md') detectedType = 'md';

      try {
        if (detectedType === 'pdf' || detectedType === 'docx') {
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });

          const res = await fetch('/api/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileData: base64Data,
              fileType: detectedType,
              fileName: file.name,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.text) extractedTexts.push(data.text);
          }
        } else {
          const text = await file.text();
          if (text) extractedTexts.push(text);
        }
      } catch (e) {
        console.error(`Failed to extract ${file.name}:`, e);
      }
    }

    if (extractedTexts.length > 0) {
      setDraftText(extractedTexts.join('\n\n---\n\n'));
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (text.trim().length > 5) {
      let range: SelectionRange | undefined;
      const root = rewrittenProseRef.current;
      if (root && viewMode === 'final') {
        try {
          const selectedRange = selection.getRangeAt(0);
          if (root.contains(selectedRange.startContainer) && root.contains(selectedRange.endContainer)) {
            const start = document.createRange();
            start.selectNodeContents(root);
            start.setEnd(selectedRange.startContainer, selectedRange.startOffset);
            const end = document.createRange();
            end.selectNodeContents(root);
            end.setEnd(selectedRange.endContainer, selectedRange.endOffset);
            const startOffset = start.toString().length;
            const endOffset = end.toString().length;
            const current = rewriteResult?.rewrittenText || '';
            if (current.slice(startOffset, endOffset) === text) {
              range = { start: startOffset, end: endOffset };
            }
          }
        } catch {
          range = undefined;
        }
      }
      setSelectedHighlight(text);
      setSelectedRange(range);
    }
  };

  const handleQuickRefineAction = async (instruction: string) => {
    if (!instruction.trim() || isRefining || isRewriting) return;
    setIsRefining(true);
    setRefineError(null);
    try {
      await applyQuickRefine(instruction);
      setCustomRefineInput('');
    } catch (err: any) {
      setRefineError(err.message || 'Failed to refine draft');
    } finally {
      setIsRefining(false);
    }
  };

  const handlePerformRewrite = async () => {
    if (isRewriting || isUploadingBrief) return;
    setRewriteError(null);
    try {
      await performRewrite();
    } catch (err: any) {
      setRewriteError(err.message || 'Failed to rewrite draft');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
            Draft Rewriting Studio
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-switch-to-profile"
            onClick={() => setActiveTab('profile')}
            className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition"
          >
            <Sliders className="w-3.5 h-3.5 text-neutral-400" />
            <span>Voice: {activeProfile.name}</span>
          </button>
        </div>
      </div>

      {!hasFreshBlueprint && (
        <div
          id="stale-blueprint-notice"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
        >
          <span>Your voice blueprint may be stale because it does not match the enabled writing samples.</span>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
          >
            Review blueprint
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Inputs and Parameters */}
        <div className="lg:col-span-5 space-y-5">
          {/* Draft Input */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-xs font-medium text-neutral-900">
                  Original draft
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="btn-load-sample-draft"
                  onClick={loadSampleDraft}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900"
                >
                  Load sample
                </button>
                <span className="text-neutral-300">•</span>
                <button
                  id="btn-upload-draft-file"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>Upload</span>
                </button>
                <span className="text-neutral-300">•</span>
                <button
                  type="button"
                  id="btn-clear-draft"
                  onClick={() => setDraftText('')}
                  disabled={!draftText.length || isRewriting}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
              </div>
            </div>

            <textarea
              id="textarea-draft-input"
              rows={9}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Paste or write your raw draft here..."
              className="w-full p-3 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 font-sans leading-relaxed text-neutral-900"
            />

            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>{wordCountOriginal} words</span>
              <span>{draftText.length} chars</span>
            </div>
          </div>

          {/* Project Brief Input */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-neutral-500" />
                <label htmlFor="textarea-project-brief" className="text-xs font-medium text-neutral-900 cursor-pointer">
                  Project brief (optional)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-upload-project-brief"
                  onClick={() => briefFileInputRef.current?.click()}
                  disabled={isUploadingBrief || isRewriting}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>{isUploadingBrief ? 'Uploading…' : 'Upload'}</span>
                </button>
                <span className="text-neutral-300">•</span>
                <button
                  type="button"
                  id="btn-clear-project-brief"
                  onClick={() => {
                    setProjectBrief('');
                  }}
                  disabled={!projectBrief.length || isRewriting || isUploadingBrief}
                  className="text-[11px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
                <input
                  ref={briefFileInputRef}
                  id="file-upload-project-brief"
                  type="file"
                  accept=".md,.txt,.docx,.pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      void uploadProjectBrief(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
              </div>
            </div>

            <p id="project-brief-help" className="text-[11px] text-neutral-500 leading-normal">
              Add factual background, your role, key decisions, and results for this draft. The brief guides the rewrite; it isn’t text the agent needs to reproduce.
            </p>

            <textarea
              id="textarea-project-brief"
              rows={4}
              value={projectBrief}
              onChange={(e) => {
                setProjectBrief(e.target.value);
              }}
              disabled={isUploadingBrief}
              aria-describedby="project-brief-help project-brief-count"
              aria-invalid={projectBrief.length > PROJECT_BRIEF_MAX_CHARS}
              placeholder="Paste background facts, metrics, decisions, and constraints for this draft..."
              className="w-full p-3 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 font-sans leading-relaxed text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400"
            />

            {(briefUploadError || projectBrief.length > PROJECT_BRIEF_MAX_CHARS) && (
              <div role="alert" className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 leading-relaxed">
                {briefUploadError || `Project brief exceeds the ${PROJECT_BRIEF_MAX_CHARS.toLocaleString()} character limit.`}
              </div>
            )}

            <div id="project-brief-count" className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>{wordCountBrief} words</span>
              <span>{projectBrief.length} chars</span>
            </div>
          </div>

          {/* Tone Sliders */}
          <ToneSlidersControl
            adjustments={toneAdjustments}
            onChange={setToneAdjustments}
            onReset={resetToneAdjustments}
            baseFormality={activeProfile.metrics?.formality || 65}
          />

          {/* Domain Context & Topics Link */}
          <div className="bg-white rounded-xl border border-neutral-200 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Database className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-neutral-900 block truncate">
                    {domainExpertise?.enabled && domainExpertise?.field
                      ? domainExpertise.field
                      : 'Domain Knowledge'}
                  </span>
                  <span className="text-[11px] text-neutral-400 block">
                    {domainExpertise?.enabled
                      ? `${(domainExpertise?.topics || []).filter((t) => t.enabled).length} topics active`
                      : 'Disabled in rewrites'}
                  </span>
                </div>
              </div>

              <button
                id="btn-nav-domain"
                type="button"
                onClick={() => setActiveTab('domain')}
                className="text-xs text-neutral-700 hover:text-neutral-900 font-medium flex items-center gap-1 shrink-0 px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50 transition"
              >
                <span>Edit</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Quick topic toggles */}
            {domainExpertise?.enabled && domainExpertise?.topics && domainExpertise.topics.length > 0 && (
              <div className="pt-2 border-t border-neutral-100 flex flex-wrap gap-1">
                {domainExpertise.topics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      const updatedTopics = domainExpertise.topics!.map((top) =>
                        top.id === t.id ? { ...top, enabled: !top.enabled } : top
                      );
                      updateDomainExpertise({
                        ...domainExpertise,
                        topics: updatedTopics,
                      });
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition flex items-center gap-1 ${
                      t.enabled
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:text-neutral-700'
                    }`}
                    title={t.enabled ? `Disable ${t.name} for this rewrite` : `Enable ${t.name} for this rewrite`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${t.enabled ? 'bg-emerald-400' : 'bg-neutral-300'}`} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transformation Controls */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-4">
            <div>
              <span className="text-xs font-medium text-neutral-900 block mb-2">
                Rewrite intensity
              </span>

              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'polish',
                    title: 'Light',
                    desc: 'Tightens phrasing and sentence flow',
                  },
                  {
                    id: 'faithful',
                    title: 'Balanced',
                    desc: 'Adapts pacing and syntax to match your voice',
                  },
                  {
                    id: 'transform',
                    title: 'Thorough',
                    desc: 'Deeper recasting while preserving substance',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    id={`btn-intensity-${opt.id}`}
                    onClick={() => setRewriteIntensity(opt.id as RewriteIntensity)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      rewriteIntensity === opt.id
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="font-medium text-xs block">{opt.title}</span>
                    <span
                      className={`text-[10px] block mt-0.5 line-clamp-2 ${
                        rewriteIntensity === opt.id ? 'text-neutral-300' : 'text-neutral-400'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>
                  {preservationSettings.keepStructure
                    ? 'Preserves substance and section order while allowing natural sentence, paragraph, and length changes.'
                    : 'Preserves substance while allowing section order, paragraph structure, and length to change.'}
                </span>
              </p>
            </div>

            {/* What to keep unchanged */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Keep unchanged</span>
                </div>
                <span className="text-[11px] text-neutral-400">Control exact preservation</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {standardPreserveOptions.map((opt, idx) => {
                  const isChecked = Boolean(preservationSettings[opt.key]);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => togglePreserveOption(opt.key)}
                      className={`text-[11px] px-2.5 py-1 rounded border transition ${
                        isChecked
                          ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  id="btn-preserve-headings"
                  type="button"
                  onClick={() => updatePreservationSettings({
                    headingTreatment: preservationSettings.headingTreatment === 'preserve_verbatim' ? 'revise_in_voice' : 'preserve_verbatim',
                  })}
                  className={`text-[11px] px-2.5 py-1 rounded border transition ${
                    preservationSettings.headingTreatment === 'preserve_verbatim'
                      ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {preservationSettings.headingTreatment === 'preserve_verbatim' ? '✓ ' : '+ '}Headings verbatim
                </button>
                <button
                  id="btn-preserve-structure"
                  type="button"
                  onClick={() => updatePreservationSettings({ keepStructure: !preservationSettings.keepStructure })}
                  className={`text-[11px] px-2.5 py-1 rounded border transition ${
                    preservationSettings.keepStructure
                      ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {preservationSettings.keepStructure ? '✓ ' : '+ '}Section order
                </button>
              </div>

              <textarea
                id="input-preservation-locks"
                rows={2}
                value={preservationLocks}
                onChange={(e) => {
                  setPreservationLocks(e.target.value);
                  updatePreservationSettings({ customLocks: e.target.value });
                }}
                placeholder="Additional facts, names, or constraints to protect..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900"
              />
            </div>

            {/* Additional instructions */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <label className="text-xs font-medium text-neutral-800 block">
                Additional instructions (optional)
              </label>
              <textarea
                id="input-custom-directives"
                rows={3}
                value={customDirectives}
                onChange={(e) => setCustomDirectives(e.target.value)}
                placeholder="e.g. Keep under 250 words, make the conclusion stronger, focus on action items..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900"
              />
            </div>

            {/* Model and Reasoning Controls */}
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                  <Cpu className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Model & reasoning</span>
                </div>
                <button
                  id="btn-toggle-model-settings"
                  type="button"
                  onClick={() => setShowModelControls(!showModelControls)}
                  className="text-[11px] text-neutral-500 hover:text-neutral-800 flex items-center gap-0.5"
                >
                  <span>{showModelControls ? 'Hide' : 'Configure'}</span>
                  {showModelControls ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-600 bg-neutral-50 px-2.5 py-1.5 rounded-md border border-neutral-100">
                <span className="font-medium text-neutral-900">{currentModelName}</span>
                <span>{currentReasoningLabel} reasoning</span>
              </div>

              {showModelControls && (
                <div className="pt-1">
                  <ModelSelector variant="inline" />
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              id="btn-perform-rewrite"
              onClick={handlePerformRewrite}
              disabled={isRewriting || isUploadingBrief || projectBrief.length > PROJECT_BRIEF_MAX_CHARS || wordCountOriginal === 0}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-xs bg-neutral-900 text-white hover:bg-neutral-800 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRewriting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Writing and reviewing...</span>
                </>
              ) : (
                <span>Rewrite in my voice</span>
              )}
            </button>
            {rewriteError && (
              <p id="rewrite-error" className="text-xs text-rose-600 font-medium pt-1" role="alert">
                {rewriteError}
              </p>
            )}
          </div>
        </div>

        {/* Right: Output */}
        <div className="lg:col-span-7 space-y-5">
          {rewriteResult ? (
            <div className="space-y-5">
              {/* Style Similarity */}
              {rewriteResult.historicalAssessment && rewriteResult.styleSimilarity && (
                <div className="space-y-2">
                  <p
                    id="historical-score-notice"
                    className="text-[11px] text-neutral-500"
                  >
                    Historical voice score · unverified for this current corpus
                  </p>
                  <StyleSimilarityCard
                    score={rewriteResult.styleSimilarity}
                    profileName={activeProfile.name}
                  />
                </div>
              )}

              {rewriteResult.review && (
                <div
                  id="writing-review-panel"
                  className={`rounded-xl border p-4 space-y-3 ${
                    rewriteResult.review.status === 'complete'
                      ? 'border-indigo-200 bg-indigo-50/40'
                      : 'border-amber-200 bg-amber-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xs font-semibold text-neutral-900">Review of this draft</h2>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {rewriteResult.review.status === 'complete'
                          ? 'AI observations and local preservation checks'
                          : 'Review unavailable; the generated draft was retained'}
                      </p>
                    </div>
                    {rewriteResult.review.modelUsed && (
                      <span className="text-[10px] font-mono text-neutral-500">{rewriteResult.review.modelUsed}</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">{rewriteResult.review.summary}</p>
                  {(rewriteResult.review.localChecks || []).length > 0 && (
                    <div className="space-y-2">
                      {(rewriteResult.review.localChecks || []).map((check) => (
                        <div
                          key={check.kind}
                          className={`rounded border px-2 py-1.5 ${
                            check.passed
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          <div className="text-[10px] font-medium">
                            {check.kind}: {check.passed ? 'passed' : 'possible mismatch'}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-relaxed">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {((rewriteResult.review.findings || []).length > 0 || (rewriteResult.review.voiceObservations || []).length > 0) && (
                    <div className="space-y-2 text-xs text-neutral-700">
                      {(rewriteResult.review.findings || []).map((finding, index) => (
                        <div key={`finding-${index}`} className="rounded border border-indigo-100 bg-white/70 px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700">
                            <span>{finding.category}</span>
                            <span className="text-neutral-400">·</span>
                            <span>{finding.severity}</span>
                          </div>
                          <p className="mt-0.5">{finding.detail}</p>
                          {finding.evidence && (
                            <p className="mt-1 text-[11px] text-neutral-500">Evidence: {finding.evidence}</p>
                          )}
                        </div>
                      ))}
                      {(rewriteResult.review.voiceObservations || []).map((observation, index) => (
                        <div key={`voice-${index}`} className="rounded border border-indigo-100 bg-white/70 px-2.5 py-2">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-indigo-700">voice observation</div>
                          <p className="mt-0.5">{observation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {rewriteResult.review.error && (
                    <p className="text-[11px] text-amber-800">{rewriteResult.review.error}</p>
                  )}
                </div>
              )}

              {/* Output Container */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                {/* View Switcher and Action Bar */}
                <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-neutral-100 gap-2">
                  <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg">
                    <button
                      id="view-mode-final"
                      onClick={() => setViewMode('final')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'final'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      Final draft
                    </button>
                    <button
                      id="view-mode-side-by-side"
                      onClick={() => setViewMode('side-by-side')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'side-by-side'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      Side by side
                    </button>
                    <button
                      id="view-mode-diff"
                      onClick={() => setViewMode('diff')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        viewMode === 'diff'
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      Differences
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      id="btn-copy-rewritten"
                      onClick={handleCopy}
                      className="flex items-center gap-1 px-2.5 py-1 rounded border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      id="btn-download-md"
                      onClick={() => handleDownload('md')}
                      className="p-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs"
                      title="Download Markdown"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metric Bar */}
                <div className="px-4 py-2 bg-neutral-50/50 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-neutral-500">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] min-w-0">
                    <span>Original: {wordCountSource} words</span>
                    <span>→</span>
                    <span className="text-neutral-900 font-medium">
                      Rewritten: {wordCountRewritten} words
                    </span>
                    {(rewriteResult.writingModelUsed || rewriteResult.modelUsed) && (
                      <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-sans text-[10px]">
                        Writing: {modelDisplayNames[rewriteResult.writingModelUsed || rewriteResult.modelUsed || ''] || rewriteResult.writingModelUsed || rewriteResult.modelUsed}
                        {rewriteResult.writingDurationMs ? ` (${(rewriteResult.writingDurationMs / 1000).toFixed(1)}s)` : ''}
                      </span>
                    )}
                    {rewriteResult.analysisModelUsed && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-sans text-[10px]">
                        Review: {modelDisplayNames[rewriteResult.analysisModelUsed] || rewriteResult.analysisModelUsed}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-400 sm:ml-auto sm:text-right break-words">
                    Tip: Highlight any sentence to leave notes or request revisions
                  </span>
                </div>

                {/* Main Content Render */}
                <div
                  id="rendered-prose-container"
                  ref={rewrittenProseRef}
                  onMouseUp={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  tabIndex={0}
                  aria-label="Rewritten draft. Select text with the mouse or keyboard to request a line edit."
                  className="p-5 select-text cursor-text focus:outline-none focus:ring-2 focus:ring-neutral-200"
                >
                  {viewMode === 'diff' && (
                    <DiffViewer
                      original={rewriteResult.originalText}
                      modified={rewriteResult.rewrittenText}
                    />
                  )}

                  {viewMode === 'side-by-side' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans leading-relaxed">
                      <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                        <span className="text-[11px] text-neutral-400 block mb-1">
                          Original draft
                        </span>
                        <div className="whitespace-pre-wrap text-neutral-600">
                          {rewriteResult.originalText}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-white border border-neutral-200">
                        <span className="text-[11px] text-neutral-900 font-medium block mb-1">
                          Rewritten
                        </span>
                        <div className="whitespace-pre-wrap text-neutral-900">
                          {rewriteResult.rewrittenText}
                        </div>
                      </div>
                    </div>
                  )}

                  {viewMode === 'final' && (
                    <div className="p-2 text-neutral-900 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                      {rewriteResult.rewrittenText}
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Manager */}
              <RewriteFeedbackManager
                selectedText={selectedHighlight}
                selectionRange={selectedRange}
                onClearSelection={() => {
                  setSelectedHighlight('');
                  setSelectedRange(undefined);
                }}
              />

              {/* Quick Refine */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-900">
                    Quick adjustments
                  </span>
                  {isRefining && (
                    <span className="text-xs text-neutral-500 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Applying adjustment...</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Shorten sentences for a punchier rhythm',
                    'Make slightly more conversational and candid',
                    'Tighten prose and remove filler words',
                    'Refine word choice for clarity',
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      disabled={isRefining || isRewriting}
                      onClick={() => handleQuickRefineAction(chip)}
                      className="px-2.5 py-1 rounded text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition border border-neutral-200 disabled:opacity-40"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="input-custom-refine"
                    type="text"
                    value={customRefineInput}
                    onChange={(e) => setCustomRefineInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleQuickRefineAction(customRefineInput);
                    }}
                    placeholder="Enter an instruction (e.g. Expand on paragraph 2)..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900"
                  />
                  <button
                    id="btn-apply-refine"
                    disabled={!customRefineInput.trim() || isRefining || isRewriting}
                    onClick={() => handleQuickRefineAction(customRefineInput)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 disabled:opacity-40"
                  >
                    Apply adjustment
                  </button>
                </div>
                {refineError && (
                  <p className="text-xs text-rose-600 font-medium pt-1">
                    {refineError}
                  </p>
                )}
              </div>

              {/* Summary of Changes */}
              <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-neutral-900">
                    Summary of changes
                  </h3>
                  <button
                    id="btn-toggle-audit-details"
                    onClick={() => setShowAuditDetails(!showAuditDetails)}
                    className="text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-0.5"
                  >
                    <span>{showAuditDetails ? 'Collapse' : 'Expand'}</span>
                    {showAuditDetails ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {showAuditDetails && (
                  <div className="space-y-3 text-xs pt-1">
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-neutral-700 leading-relaxed">
                      <span className="font-medium text-neutral-900 block mb-0.5">
                        Editorial notes
                      </span>
                      {rewriteResult.changesExplanation}
                    </div>

                    {rewriteResult.stylisticAudit && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border border-neutral-100 bg-neutral-50">
                        <span className="font-medium text-neutral-900 block mb-0.5">
                          Rhythm and pacing
                        </span>
                        <p className="text-neutral-600 leading-relaxed">
                          {rewriteResult.stylisticAudit?.cadenceChanges}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-neutral-100 bg-neutral-50">
                        <span className="font-medium text-neutral-900 block mb-0.5">
                          Structure and flow
                        </span>
                        <p className="text-neutral-600 leading-relaxed">
                          {rewriteResult.stylisticAudit?.structuralTweaks}
                        </p>
                      </div>
                    </div>}

                    {rewriteResult.stylisticAudit?.vocabularySubstitutions &&
                      rewriteResult.stylisticAudit.vocabularySubstitutions.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="font-medium text-neutral-900 block text-xs">
                            Word substitutions
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rewriteResult.stylisticAudit.vocabularySubstitutions.map((sub, i) => (
                              <div
                                key={i}
                                className="p-2.5 rounded-lg border border-neutral-100 bg-neutral-50 space-y-0.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-rose-700 font-medium line-through">
                                    {sub.from}
                                  </span>
                                  <span className="text-neutral-400">→</span>
                                  <span className="text-neutral-900 font-medium">{sub.to}</span>
                                </div>
                                <p className="text-[11px] text-neutral-500">{sub.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center space-y-3">
              <FileText className="w-8 h-8 text-neutral-300 mx-auto" />
              <h3 className="text-sm font-medium text-neutral-900">
                Rewritten draft will appear here
              </h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Paste a draft on the left and click "Rewrite in my voice".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

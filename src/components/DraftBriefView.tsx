import React, { useRef } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { PROJECT_BRIEF_MAX_CHARS, READER_PURPOSE_MAX_CHARS } from '../writingPipeline';
import { FileText, UploadCloud, ArrowRight } from 'lucide-react';

export const DraftBriefView: React.FC = () => {
  const {
    draftText,
    setDraftText,
    isUploadingDraft,
    draftUploadError,
    uploadDraft,
    projectBrief,
    setProjectBrief,
    readerPurpose,
    setReaderPurpose,
    isUploadingBrief,
    briefUploadError,
    uploadProjectBrief,
    loadSampleDraft,
    isRewriting,
    setActiveTab,
  } = useWritingAssistant();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const briefFileInputRef = useRef<HTMLInputElement | null>(null);

  const wordCountOriginal = draftText.trim() ? draftText.trim().split(/\s+/).length : 0;
  const wordCountBrief = projectBrief.trim() ? projectBrief.trim().split(/\s+/).length : 0;
  const wordCountReaderPurpose = readerPurpose.trim() ? readerPurpose.trim().split(/\s+/).length : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
            Draft &amp; Brief
          </h1>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            Provide your draft, optional project brief, and reader and purpose. All are saved in this browser for rewriting and review. Draft and brief can also guide domain generation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-draft-brief-to-domain"
            type="button"
            onClick={() => setActiveTab('domain')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
          >
            <span>Domain Knowledge</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Form Cards */}
      <div className="space-y-6">
        {/* Original Draft */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-700" />
              <label htmlFor="textarea-draft-input" className="text-sm font-semibold text-neutral-900 cursor-pointer">
                Original draft
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-load-sample-draft"
                onClick={loadSampleDraft}
                disabled={isUploadingDraft || isRewriting}
                className="text-xs text-neutral-600 hover:text-neutral-900"
              >
                Load sample
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                id="btn-upload-draft-file"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDraft || isRewriting}
                className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isUploadingDraft ? 'Uploading…' : 'Upload'}</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                id="btn-clear-draft"
                onClick={() => setDraftText('')}
                disabled={!draftText.length || isRewriting || isUploadingDraft}
                className="text-xs text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void uploadDraft(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </div>
          </div>

          <textarea
            id="textarea-draft-input"
            rows={10}
            value={draftText}
            disabled={isUploadingDraft}
            aria-invalid={Boolean(draftUploadError)}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Paste or write your raw draft here..."
            className="w-full p-3.5 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 font-sans leading-relaxed text-neutral-900 resize-y"
          />

          {draftUploadError && (
            <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{draftUploadError}</p>
          )}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <span>{wordCountOriginal} words</span>
            <span>{draftText.length} chars</span>
          </div>
        </div>

        {/* Project Brief */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-700" />
              <label htmlFor="textarea-project-brief" className="text-sm font-semibold text-neutral-900 cursor-pointer">
                Project brief (optional)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-upload-project-brief"
                onClick={() => briefFileInputRef.current?.click()}
                disabled={isUploadingBrief || isRewriting}
                className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isUploadingBrief ? 'Uploading…' : 'Upload'}</span>
              </button>
              <span className="text-neutral-300">•</span>
              <button
                type="button"
                id="btn-clear-project-brief"
                onClick={() => setProjectBrief('')}
                disabled={!projectBrief.length || isRewriting || isUploadingBrief}
                className="text-xs text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
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

          <p id="project-brief-help" className="text-xs text-neutral-500 leading-relaxed">
            Add factual background, your role, key decisions, and results for this draft. The brief guides the rewrite; it isn’t text the agent needs to reproduce.
          </p>

          <textarea
            id="textarea-project-brief"
            rows={6}
            value={projectBrief}
            onChange={(e) => setProjectBrief(e.target.value)}
            disabled={isUploadingBrief}
            aria-describedby="project-brief-help project-brief-count"
            aria-invalid={projectBrief.length > PROJECT_BRIEF_MAX_CHARS}
            placeholder="Paste background facts, metrics, decisions, and constraints for this draft..."
            className="w-full p-3.5 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 font-sans leading-relaxed text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400 resize-y"
          />

          {(briefUploadError || projectBrief.length > PROJECT_BRIEF_MAX_CHARS) && (
            <div role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
              {briefUploadError || `Project brief exceeds the ${PROJECT_BRIEF_MAX_CHARS.toLocaleString()} character limit.`}
            </div>
          )}

          <div id="project-brief-count" className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <span>{wordCountBrief} words</span>
            <span>{projectBrief.length} chars</span>
          </div>
        </div>

        {/* Reader and purpose */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-700" />
              <label htmlFor="textarea-reader-purpose" className="text-sm font-semibold text-neutral-900 cursor-pointer">
                Reader and purpose (optional)
              </label>
            </div>
            <button
              type="button"
              id="btn-clear-reader-purpose"
              onClick={() => setReaderPurpose('')}
              disabled={!readerPurpose.length || isRewriting}
              className="text-xs text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          <p id="reader-purpose-help" className="text-xs text-neutral-500 leading-relaxed">
            Describe who will read this and what the prose should help them understand or decide. This guides editorial emphasis and organization; it does not add facts or replace the source.
          </p>

          <textarea
            id="textarea-reader-purpose"
            rows={4}
            value={readerPurpose}
            onChange={(e) => setReaderPurpose(e.target.value)}
            disabled={isRewriting}
            aria-describedby="reader-purpose-help reader-purpose-count"
            aria-invalid={readerPurpose.length > READER_PURPOSE_MAX_CHARS}
            placeholder="For example: Hiring managers reading a case study. Help them understand my role and the key decisions."
            className="w-full p-3.5 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 font-sans leading-relaxed text-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400 resize-y"
          />

          {readerPurpose.length > READER_PURPOSE_MAX_CHARS && (
            <div role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5 leading-relaxed">
              Reader and purpose exceeds the {READER_PURPOSE_MAX_CHARS.toLocaleString()} character limit.
            </div>
          )}

          <div id="reader-purpose-count" className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <span>{wordCountReaderPurpose} words</span>
            <span>{readerPurpose.length} chars</span>
          </div>
        </div>

        {/* Progression Footer */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-neutral-400">
            Draft, brief, and reader-and-purpose guidance are saved in this browser and restored when you return
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('domain')}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
            >
              Domain Knowledge
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className="px-3.5 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition"
            >
              Rewrite Studio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

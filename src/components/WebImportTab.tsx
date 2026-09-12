import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DiscoveredPortfolioPiece, PortfolioDiscoveryResult, FileType } from '../types';
import {
  Globe,
  Link as LinkIcon,
  Sparkles,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  BookmarkCheck,
  ArrowRight,
  RotateCcw,
  FileText,
  Copy,
} from 'lucide-react';

interface WebImportTabProps {
  onImportSamples: (
    samples: Array<{
      title: string;
      content: string;
      fileType: FileType;
      fileName?: string;
      wordCount: number;
      charCount: number;
    }>
  ) => Promise<void>;
  isSubmitting: boolean;
}

const AUDIENCE_SUGGESTIONS = [
  'Tech & Engineering Leaders',
  'Executive / B2B Leadership',
  'Analytical & Research Essays',
  'Conversational Newsletter',
  'Creative Non-Fiction',
];

const WRITING_TYPE_SUGGESTIONS = [
  'Long-form Analytical Essays',
  'Technical Architecture & Deep Dives',
  'Strategy Memos & Vision',
  'Opinion & Commentary',
];

export const WebImportTab: React.FC<WebImportTabProps> = ({
  onImportSamples,
  isSubmitting,
}) => {
  const { modelSettings } = useWritingAssistant();

  // Mode: 'single' (direct single article import, zero alignment needed) vs 'portfolio' (AI portfolio curation)
  const [subMode, setSubMode] = useState<'single' | 'portfolio'>('single');

  // Single Link state
  const [singleUrl, setSingleUrl] = useState('');
  const [isFetchingSingle, setIsFetchingSingle] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [fetchedArticle, setFetchedArticle] = useState<{
    title: string;
    content: string;
    wordCount: number;
    charCount: number;
    url: string;
    siteName?: string;
  } | null>(null);

  // Portfolio Discovery state
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [writingType, setWritingType] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<PortfolioDiscoveryResult | null>(null);
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);

  // --- Handlers for Single Article Import ---
  const handleFetchSingle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const urlToFetch = singleUrl.trim();
    if (!urlToFetch) {
      setSingleError('Please enter a link to fetch.');
      return;
    }

    setSingleError(null);
    setIsFetchingSingle(true);

    try {
      const res = await fetch('/api/fetch-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToFetch }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch article from link');
      }

      setFetchedArticle({
        title: data.title || 'Imported Article',
        content: data.content,
        wordCount: data.wordCount,
        charCount: data.charCount,
        url: data.url,
        siteName: data.siteName,
      });
    } catch (err: any) {
      setSingleError(err.message || 'Could not fetch text from this link');
    } finally {
      setIsFetchingSingle(false);
    }
  };

  const handleImportSingle = async () => {
    if (!fetchedArticle) return;
    await onImportSamples([
      {
        title: fetchedArticle.title.trim() || 'Imported Web Article',
        content: fetchedArticle.content,
        fileType: 'url' as FileType,
        fileName: fetchedArticle.url,
        wordCount: fetchedArticle.wordCount,
        charCount: fetchedArticle.charCount,
      },
    ]);
  };

  // --- Handlers for Portfolio Discovery ---
  const handleScanPortfolio = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const urlToScan = portfolioUrl.trim();
    if (!urlToScan) {
      setScanError('Please enter a website or portfolio URL.');
      return;
    }

    setScanError(null);
    setIsScanning(true);
    setScanStep('Connecting to website and discovering writing pieces...');

    try {
      const res = await fetch('/api/discover-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToScan,
          targetAudience: targetAudience.trim() || undefined,
          writingType: writingType.trim() || undefined,
          model: modelSettings?.model,
          reasoningLevel: modelSettings?.reasoningLevel,
        }),
      });

      setScanStep('Response received.');

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to discover portfolio pieces');
      }

      setDiscoveryResult(data);

      const recommended = (data.pieces || []).filter((p: DiscoveredPortfolioPiece) => p.recommended);
      const initialIds = new Set<string>(
        recommended.length > 0
          ? recommended.map((p: DiscoveredPortfolioPiece) => p.id)
          : (data.pieces || []).map((p: DiscoveredPortfolioPiece) => p.id)
      );
      setSelectedPieceIds(initialIds);
    } catch (err: any) {
      setScanError(err.message || 'Unable to scan portfolio URL');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const togglePiece = (id: string) => {
    setSelectedPieceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!discoveryResult) return;
    setSelectedPieceIds(new Set(discoveryResult.pieces.map((p) => p.id)));
  };

  const selectRecommendedOnly = () => {
    if (!discoveryResult) return;
    const recs = discoveryResult.pieces.filter((p) => p.recommended).map((p) => p.id);
    setSelectedPieceIds(new Set(recs));
  };

  const handleImportPortfolioPieces = async () => {
    if (!discoveryResult || selectedPieceIds.size === 0) return;

    const toImport = discoveryResult.pieces
      .filter((p) => selectedPieceIds.has(p.id))
      .map((p) => ({
        title: p.title,
        content: p.content,
        fileType: 'portfolio' as FileType,
        fileName: `${p.title} (${discoveryResult.siteTitle || 'Portfolio'})`,
        wordCount: p.wordCount,
        charCount: p.content.length,
      }));

    await onImportSamples(toImport);
  };

  return (
    <div className="space-y-4">
      {/* Submode Switcher */}
      <div className="flex items-center p-1 bg-neutral-100 rounded-lg max-w-sm">
        <button
          type="button"
          id="btn-submode-single"
          onClick={() => setSubMode('single')}
          className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            subMode === 'single'
              ? 'bg-white text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <LinkIcon className="w-3 h-3" />
          <span>Single Article / Link</span>
        </button>
        <button
          type="button"
          id="btn-submode-portfolio"
          onClick={() => setSubMode('portfolio')}
          className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition flex items-center justify-center gap-1.5 ${
            subMode === 'portfolio'
              ? 'bg-white text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Sparkles className="w-3 h-3 text-neutral-700" />
          <span>Portfolio Discovery</span>
        </button>
      </div>

      {/* VIEW 1: SINGLE ARTICLE / LINK (Direct & Instant, No Alignment) */}
      {subMode === 'single' && (
        <div className="space-y-4">
          {singleError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{singleError}</span>
            </div>
          )}

          {!fetchedArticle ? (
            <form onSubmit={handleFetchSingle} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="input-single-url" className="text-xs font-medium text-neutral-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Article, Essay, or Blog Post Link</span>
                  </span>
                  <span className="text-[11px] text-emerald-600 font-medium">Direct import</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    id="input-single-url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://example.com/blog/my-essay or Substack / Medium link"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-neutral-200 focus:border-neutral-900 text-neutral-900 bg-white"
                    disabled={isFetchingSingle}
                    autoFocus
                    required
                  />
                  <button
                    type="submit"
                    id="btn-fetch-single-link"
                    disabled={isFetchingSingle || !singleUrl.trim()}
                    className="px-3.5 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                  >
                    {isFetchingSingle ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <span>Fetch text</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Instantly extracts the full article text and paragraph structure without needing audience alignment or waiting.
                </p>
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
                <div className="font-medium text-neutral-800">Supported web sources:</div>
                <ul className="list-disc list-inside text-[11px] text-neutral-500 space-y-0.5">
                  <li>Substack, Medium, Ghost blogs, personal author websites</li>
                  <li>Technical blogs, architectural notes, and documentation pages</li>
                  <li>Clean articles and long-form essays with preserved paragraphs</li>
                </ul>
              </div>
            </form>
          ) : (
            /* PREVIEW OF FETCHED SINGLE ARTICLE */
            <div className="space-y-3.5">
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900">
                      Article Extracted Successfully
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFetchedArticle(null);
                      setSingleError(null);
                    }}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Change link</span>
                  </button>
                </div>

                {/* Editable Title */}
                <div className="space-y-1">
                  <label htmlFor="input-fetched-article-title" className="text-[11px] font-medium text-neutral-600">Sample Title</label>
                  <input
                    type="text"
                    id="input-fetched-article-title"
                    value={fetchedArticle.title}
                    onChange={(e) =>
                      setFetchedArticle({ ...fetchedArticle, title: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 focus:border-neutral-900 bg-white"
                  />
                </div>

                {/* Meta stats */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 pt-1 border-t border-neutral-200">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-700">
                      {fetchedArticle.wordCount.toLocaleString()} words
                    </span>
                    <span>•</span>
                    <span>{fetchedArticle.charCount.toLocaleString()} characters</span>
                  </div>
                  {fetchedArticle.url && (
                    <a
                      href={fetchedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
                    >
                      <span>{fetchedArticle.siteName || 'Source link'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Text Preview */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-600">Article Content Preview</label>
                <div className="p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 max-h-56 overflow-y-auto font-sans leading-relaxed whitespace-pre-line">
                  {fetchedArticle.content}
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFetchedArticle(null)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-import-single-article"
                  onClick={handleImportSingle}
                  disabled={isSubmitting || !fetchedArticle.content}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding to Samples...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Add to Writing Samples</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: PORTFOLIO DISCOVERY (Scan Whole Site + Align with Target Audience) */}
      {subMode === 'portfolio' && (
        <div className="space-y-4">
          {scanError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{scanError}</span>
            </div>
          )}

          {discoveryResult ? (
            /* Results View */
            <div className="space-y-4">
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-neutral-800 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900">
                      Portfolio Curation Results
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveryResult(null);
                      setSelectedPieceIds(new Set());
                    }}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Scan another site</span>
                  </button>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  {discoveryResult.agentSummary}
                </p>

                <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                  <div className="flex items-center gap-2 truncate">
                    <Globe className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="truncate font-medium text-neutral-700">
                      {discoveryResult.siteTitle}
                    </span>
                    <span className="text-neutral-300">•</span>
                    <span className="truncate text-neutral-500">
                      Target: {discoveryResult.targetAudience}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectRecommendedOnly}
                      className="text-neutral-600 hover:text-neutral-900 font-medium"
                    >
                      Recommended ({discoveryResult.pieces.filter((p) => p.recommended).length})
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-neutral-600 hover:text-neutral-900 font-medium"
                    >
                      Select all ({discoveryResult.pieces.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Pieces List */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {discoveryResult.pieces.map((piece) => {
                  const isSelected = selectedPieceIds.has(piece.id);
                  const isExpanded = expandedPreviewId === piece.id;

                  return (
                    <div
                      key={piece.id}
                      className={`rounded-xl border transition p-3 space-y-2 ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-50/50'
                          : 'border-neutral-200 bg-white hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id={`check-portfolio-piece-${piece.id}`}
                          checked={isSelected}
                          onChange={() => togglePiece(piece.id)}
                          className="mt-1 h-3.5 w-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 shrink-0 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <label
                              htmlFor={`check-portfolio-piece-${piece.id}`}
                              className="text-xs font-semibold text-neutral-900 cursor-pointer hover:underline truncate"
                            >
                              {piece.title}
                            </label>

                            {piece.recommended && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-neutral-900 text-white">
                                <BookmarkCheck className="w-2.5 h-2.5 text-emerald-400" />
                                <span>Recommended</span>
                              </span>
                            )}

                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium ${
                                piece.alignmentScore >= 88
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                              }`}
                            >
                              {piece.alignmentScore}% Match
                            </span>

                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                              {piece.detectedType}
                            </span>
                          </div>

                          <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                            {piece.excerpt}
                          </p>

                          <div className="mt-1.5 p-2 rounded-lg bg-white border border-neutral-200/80 text-[11px] text-neutral-700">
                            <span className="font-medium text-neutral-900">Why selected: </span>
                            {piece.alignmentRationale}
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                            <div className="flex items-center gap-2">
                              {piece.url && (
                                <a
                                  href={piece.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                                >
                                  <span>Source link</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              <span>•</span>
                              <span>{piece.wordCount} words</span>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreviewId(isExpanded ? null : piece.id)
                              }
                              className="text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium"
                            >
                              <span>{isExpanded ? 'Hide text' : 'Preview text'}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 max-h-44 overflow-y-auto leading-relaxed whitespace-pre-line font-sans">
                              {piece.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action bar */}
              <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  <span className="font-semibold text-neutral-900">
                    {selectedPieceIds.size}
                  </span>{' '}
                  of {discoveryResult.pieces.length} selected
                </div>

                <button
                  type="button"
                  id="btn-import-curated-portfolio-pieces"
                  onClick={handleImportPortfolioPieces}
                  disabled={selectedPieceIds.size === 0 || isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Import Selected Pieces ({selectedPieceIds.size})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Portfolio Form */
            <form onSubmit={handleScanPortfolio} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="input-portfolio-site-url" className="text-xs font-medium text-neutral-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Portfolio or Publication Site Link</span>
                  </span>
                  <span className="text-[11px] text-neutral-500">Required</span>
                </label>
                <input
                  type="url"
                  id="input-portfolio-site-url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  placeholder="https://yourname.com/writing or Substack publication homepage"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 focus:border-neutral-900 text-neutral-900 bg-white"
                  disabled={isScanning}
                  required
                />
                <p className="text-[11px] text-neutral-500">
                  Scans your site or publication to discover articles matching your target audience.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-portfolio-audience-goal" className="text-xs font-medium text-neutral-800 flex items-center justify-between">
                  <span>Target audience or writing goal</span>
                  <span className="text-[11px] text-neutral-500">Helps agent curate pieces</span>
                </label>
                <input
                  type="text"
                  id="input-portfolio-audience-goal"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Technical leaders, executive founders, general audience"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 focus:border-neutral-900 text-neutral-900 bg-white"
                  disabled={isScanning}
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {AUDIENCE_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTargetAudience(sug)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                        targetAudience === sug
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-portfolio-format-goal" className="text-xs font-medium text-neutral-800">
                  Desired writing format
                </label>
                <input
                  type="text"
                  id="input-portfolio-format-goal"
                  value={writingType}
                  onChange={(e) => setWritingType(e.target.value)}
                  placeholder="e.g. Long-form essays, strategic memos, architectural deep dives"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 focus:border-neutral-900 text-neutral-900 bg-white"
                  disabled={isScanning}
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {WRITING_TYPE_SUGGESTIONS.map((typeSug) => (
                    <button
                      key={typeSug}
                      type="button"
                      onClick={() => setWritingType(typeSug)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                        writingType === typeSug
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {typeSug}
                    </button>
                  ))}
                </div>
              </div>

              {isScanning && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-700 shrink-0" />
                  <p role="status" className="text-sm text-neutral-700">
                    {scanStep}
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  id="btn-run-portfolio-discovery"
                  disabled={isScanning || !portfolioUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition disabled:opacity-40"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning Site...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Discover & Align Writing Pieces</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

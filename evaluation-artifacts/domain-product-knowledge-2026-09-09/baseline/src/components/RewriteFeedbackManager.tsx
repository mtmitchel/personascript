import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { FeedbackTag, LearnFromFeedbackResponse, SelectionRange } from '../types';
import {
  MessageSquarePlus,
  CheckCircle2,
  Trash2,
  ArrowRight,
  BrainCircuit,
  X,
  Sparkles,
  Loader2,
} from 'lucide-react';

interface FeedbackTagOption {
  tag: FeedbackTag;
  label: string;
  desc: string;
}

const FEEDBACK_TAGS: FeedbackTagOption[] = [
  {
    tag: 'too_formal',
    label: 'Too formal',
    desc: 'Too stiff or bureaucratic',
  },
  {
    tag: 'not_my_voice',
    label: 'Not my voice',
    desc: "Doesn't sound like how I write",
  },
  {
    tag: 'good',
    label: 'Sounds like me',
    desc: 'Captured my authentic phrasing',
  },
  {
    tag: 'too_casual',
    label: 'Too casual',
    desc: 'Lacks authority or precision',
  },
  {
    tag: 'too_verbose',
    label: 'Too wordy',
    desc: 'Needs trimming; extra filler',
  },
  {
    tag: 'awkward_cadence',
    label: 'Awkward flow',
    desc: 'Sentence rhythm feels unnatural',
  },
  {
    tag: 'domain_inaccurate',
    label: 'Domain inaccurate',
    desc: 'Terminology or field context is off',
  },
];

interface RewriteFeedbackManagerProps {
  selectedText: string;
  selectionRange?: SelectionRange;
  onClearSelection: () => void;
  isDrawerOpen?: boolean;
  onCloseDrawer?: () => void;
  onOpenDrawer?: () => void;
}

export const RewriteFeedbackManager: React.FC<RewriteFeedbackManagerProps> = ({
  selectedText,
  selectionRange,
  onClearSelection,
  isDrawerOpen: isDrawerOpenProp,
  onCloseDrawer: onCloseDrawerProp,
  onOpenDrawer: onOpenDrawerProp,
}) => {
  const {
    feedbackItems,
    addFeedbackItem,
    removeFeedbackItem,
    clearFeedbackItems,
    learnFromFeedback,
    isLearningFeedback,
    setActiveTab,
    editSelection,
    isRewriting,
  } = useWritingAssistant();

  const [activeTag, setActiveTag] = useState<FeedbackTag>('not_my_voice');
  const [customNote, setCustomNote] = useState('');
  const [alsoSaveRule, setAlsoSaveRule] = useState(false);
  const [isRewritingSelection, setIsRewritingSelection] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [learningResult, setLearningResult] = useState<LearnFromFeedbackResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [localDrawerOpen, setLocalDrawerOpen] = useState(false);
  const selectionBusy = isRewritingSelection || isRewriting;

  const isDrawerOpen = isDrawerOpenProp !== undefined ? isDrawerOpenProp : localDrawerOpen;
  const setIsDrawerOpen = (open: boolean) => {
    setLocalDrawerOpen(open);
    if (!open && onCloseDrawerProp) onCloseDrawerProp();
    if (open && onOpenDrawerProp) onOpenDrawerProp();
  };

  const handleRewriteSelection = async () => {
    if (!selectedText || !selectedText.trim() || selectionBusy) return;
    setIsRewritingSelection(true);
    setSelectionError(null);
    try {
      await editSelection(selectedText, customNote.trim(), activeTag, alsoSaveRule, selectionRange);
      setCustomNote('');
      onClearSelection();
    } catch (err: any) {
      setSelectionError(err.message || 'Failed to rewrite selection');
    } finally {
      setIsRewritingSelection(false);
    }
  };

  const handleAddFeedback = () => {
    if (!selectedText || !selectedText.trim()) return;

    const tagObj = FEEDBACK_TAGS.find((t) => t.tag === activeTag);
    addFeedbackItem({
      selectedText: selectedText.trim(),
      tag: activeTag,
      label: tagObj?.label || activeTag,
      note: customNote.trim() || undefined,
    });

    setCustomNote('');
    onClearSelection();
  };

  const handleLearnFromFeedback = async () => {
    if (feedbackItems.length === 0) return;
    setErrorMsg(null);
    try {
      const res = await learnFromFeedback();
      setLearningResult(res);
      setIsDrawerOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to incorporate feedback');
    }
  };

  return (
    <div id="rewrite-feedback-manager" className="space-y-4">
      {/* 1. Floating Side Feedback Card (Positioned to the side at eye-level, zero scrolling) */}
      {selectedText && (
        <div
          id="selection-feedback-form"
          className="fixed right-4 md:right-8 top-20 md:top-24 z-50 w-[340px] sm:w-[380px] bg-white border border-neutral-300 rounded-2xl shadow-2xl p-4 space-y-3.5 ring-1 ring-black/5 animate-in fade-in slide-in-from-right-4 duration-150"
        >
          <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900">
              <MessageSquarePlus className="w-4 h-4 text-neutral-800" />
              <span>Voice Feedback on Selection</span>
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              title="Cancel (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 text-xs italic text-neutral-800 line-clamp-3 leading-relaxed">
            "{selectedText}"
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-neutral-600 block">
              Stylistic Tag:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {FEEDBACK_TAGS.map((option) => (
                <button
                  key={option.tag}
                  id={`tag-btn-${option.tag}`}
                  type="button"
                  onClick={() => setActiveTag(option.tag)}
                  className={`text-left p-2 rounded-lg text-xs border transition cursor-pointer ${
                    activeTag === option.tag
                      ? 'border-neutral-900 bg-neutral-900 text-white font-medium shadow-xs'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="truncate font-medium">{option.label}</div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      activeTag === option.tag ? 'text-neutral-300' : 'text-neutral-400'
                    }`}
                  >
                    {option.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-neutral-600 block">
              Optional note or replacement rule:
            </label>
            <input
              id="feedback-note-input"
              type="text"
              autoFocus
              value={customNote}
              disabled={selectionBusy}
              onChange={(e) => setCustomNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRewriteSelection();
                if (e.key === 'Escape') onClearSelection();
              }}
              placeholder="e.g. Cut filler; sound more candid, or punch up verb"
              className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-200 bg-white focus:outline-none focus:border-neutral-900 text-neutral-900 shadow-xs disabled:opacity-60"
            />
          </div>

          <label className="flex items-center gap-2 text-[11px] text-neutral-600 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={alsoSaveRule}
              disabled={selectionBusy}
              onChange={(e) => setAlsoSaveRule(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900 focus:ring-0 cursor-pointer"
            />
            <span>Also save note to voice profile rules</span>
          </label>

          {selectionError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {selectionError}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 gap-2">
            <button
              type="button"
              onClick={onClearSelection}
              disabled={selectionBusy}
              className="text-xs text-neutral-500 hover:text-neutral-800 font-medium px-1.5 py-1 rounded cursor-pointer disabled:opacity-50"
            >
              Cancel (Esc)
            </button>
            <div className="flex items-center gap-2">
              <button
                id="btn-save-note-only"
                type="button"
              disabled={selectionBusy}
                onClick={handleAddFeedback}
                className="px-2.5 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-medium rounded-lg transition flex items-center gap-1 shadow-2xs cursor-pointer disabled:opacity-50"
                title="Queue note for Voice Blueprint profile learning without changing draft"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-neutral-500" />
                <span>Save Note Only</span>
              </button>
              <button
                id="btn-rewrite-selection"
                type="button"
              disabled={selectionBusy}
                onClick={handleRewriteSelection}
                className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                title="Immediately rewrite highlighted line in authentic voice (Enter)"
              >
                {selectionBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Rewriting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Rewrite Line</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Side Badge (Stays accessible while scrolling) */}
      {feedbackItems.length > 0 && !isDrawerOpen && (
        <button
          id="btn-open-feedback-drawer"
          onClick={() => setIsDrawerOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-neutral-900 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 hover:bg-neutral-800 hover:scale-105 transition duration-150 cursor-pointer border border-white/20"
        >
          <BrainCircuit className="w-4 h-4 text-emerald-400" />
          <span>{feedbackItems.length} Voice {feedbackItems.length === 1 ? 'Note' : 'Notes'} Queued</span>
          <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded-full text-neutral-300">View</span>
        </button>
      )}

      {/* Slide-out Drawer for reviewing queued notes and applying feedback */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl border-l border-neutral-200 flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-neutral-800" />
                <h3 className="text-sm font-semibold text-neutral-900">
                  Voice Feedback Notes ({feedbackItems.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {feedbackItems.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-xs">
                  No feedback notes queued yet. Highlight text in the draft to tag it.
                </div>
              ) : (
                feedbackItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-200 text-neutral-800 font-medium">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFeedbackItem(item.id)}
                        className="text-neutral-400 hover:text-rose-600 p-1 transition cursor-pointer"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="italic text-neutral-700 line-clamp-3">
                      "{item.selectedText}"
                    </p>
                    {item.note && (
                      <p className="text-neutral-500 text-[11px] pt-0.5">
                        <span className="font-medium text-neutral-700">Note:</span> {item.note}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {feedbackItems.length > 0 && (
              <div className="p-4 border-t border-neutral-200 bg-neutral-50 space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-500 pb-1">
                  <span>{feedbackItems.length} items to incorporate</span>
                  <button
                    type="button"
                    onClick={clearFeedbackItems}
                    className="text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
                <button
                  type="button"
                  disabled={isLearningFeedback}
                  onClick={handleLearnFromFeedback}
                  className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-40 shadow-xs cursor-pointer"
                >
                  {isLearningFeedback ? (
                    <span>Updating profile...</span>
                  ) : (
                    <>
                      <span>Apply all notes to voice profile</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. List of Collected Feedback Items */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-neutral-700" />
            <h4 className="text-xs font-medium text-neutral-900 flex items-center gap-1.5">
              <span>Voice feedback notes</span>
              <span className="text-[11px] text-neutral-400 font-mono">
                ({feedbackItems.length})
              </span>
            </h4>
          </div>

          {feedbackItems.length > 0 && (
            <button
              id="btn-clear-feedback-items"
              type="button"
              onClick={clearFeedbackItems}
              className="text-[11px] text-neutral-400 hover:text-neutral-700 transition"
            >
              Clear all
            </button>
          )}
        </div>

        {feedbackItems.length === 0 ? (
          <p className="text-xs text-neutral-400 py-1">
            Highlight any sentence in the rewritten text above to leave notes and tune your voice profile.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {feedbackItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-2 p-2 rounded-lg bg-neutral-50 border border-neutral-100 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-800">
                        {item.label}
                      </span>
                    </div>
                    <p className="italic text-neutral-700 line-clamp-1">
                      "{item.selectedText}"
                    </p>
                    {item.note && (
                      <p className="text-neutral-500 text-[11px]">
                        Note: {item.note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFeedbackItem(item.id)}
                    className="text-neutral-400 hover:text-neutral-700 p-1 shrink-0"
                    title="Remove item"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {feedbackItems.length} {feedbackItems.length === 1 ? 'item' : 'items'} queued
              </span>

              <button
                id="btn-learn-from-feedback"
                type="button"
                disabled={isLearningFeedback || feedbackItems.length === 0}
                onClick={handleLearnFromFeedback}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium rounded-lg transition flex items-center gap-1.5 disabled:opacity-40"
              >
                {isLearningFeedback ? (
                  <span>Updating profile...</span>
                ) : (
                  <>
                    <span>Apply to voice profile</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-rose-600 font-medium pt-1">
            {errorMsg}
          </p>
        )}
      </div>

      {/* 3. Learning Result Feedback Banner */}
      {learningResult && (
        <div
          id="learning-result-banner"
          className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-medium text-neutral-900">
                Voice profile updated
              </h4>
            </div>

            <button
              id="btn-view-updated-profile"
              type="button"
              onClick={() => setActiveTab('profile')}
              className="text-xs text-neutral-700 hover:text-neutral-900 font-medium flex items-center gap-1"
            >
              <span>View Profile</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {learningResult.learningSummary && (
            <div className="text-xs text-neutral-700 space-y-1">
              <ul className="list-disc list-inside space-y-0.5 text-neutral-600 pl-1">
                {learningResult.learningSummary.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

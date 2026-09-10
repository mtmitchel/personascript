import { RewriteFeedbackItem, RewriteResult } from '../types';
import { EDITORIAL_PREFERENCES_MAX_CHARS, READER_PURPOSE_MAX_CHARS } from '../writingPipeline';
import { validateApprovedPlan } from '../editorialPlan';

export const REWRITE_HISTORY_LIMIT = 20;

export function createVersionId(): string {
  // getRandomValues also works on local HTTP origins without randomUUID support.
  return `rewrite-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, '0')).join('')}`;
}

const record = (value: any): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: any): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');
const finite = (value: any): boolean => typeof value === 'number' && Number.isFinite(value);
const optional = (value: any, check: (value: any) => boolean): boolean => value === undefined || check(value);
const string = (value: any): boolean => typeof value === 'string';

export function isRewriteFeedback(value: unknown): value is RewriteFeedbackItem[] {
  return Array.isArray(value) && value.every((item) => record(item)
    && ['id', 'selectedText', 'label', 'createdAt'].every((key) => string(item[key]))
    && ['too_formal', 'too_casual', 'not_my_voice', 'good', 'too_verbose', 'awkward_cadence', 'domain_inaccurate', 'custom'].includes(item.tag)
    && optional(item.note, string)
    && optional(item.saveStatus, (status) => status === 'pending' || status === 'failed'));
}

/** Reject damaged records before rendering or autosaving them; retain the raw storage value. */
function isSavedRewrite(value: any): boolean {
  if (!record(value)
    || !['profileId', 'profileName', 'originalText', 'rewrittenText', 'changesExplanation', 'createdAt'].every((key) => string(value[key]))
    || !['polish', 'faithful', 'transform'].includes(value.intensity)
    || !['wordCountOriginal', 'wordCountRewritten'].every((key) => finite(value[key]) && value[key] >= 0)
    || !['id', 'parentId', 'customInstructions', 'preservationLocks', 'projectBrief', 'readerPurpose', 'editorialPreferences', 'modelUsed', 'writingModelUsed', 'analysisModelUsed'].every((key) => optional(value[key], string))
    || !['durationMs', 'writingDurationMs'].every((key) => optional(value[key], finite))
    || !optional(value.historicalAssessment, (item) => typeof item === 'boolean')
    || !optional(value.feedbackItems, isRewriteFeedback)) return false;
  try {
    validateApprovedPlan(value.editorialPlan, { draft: value.originalText, projectBrief: value.projectBrief || '', readerPurpose: value.readerPurpose || '', editorialPreferences: value.editorialPreferences });
  } catch { return false; }
  if (!optional(value.readerPurpose, (item) => typeof item === 'string' && item.length <= READER_PURPOSE_MAX_CHARS)) return false;
  if (!optional(value.editorialPreferences, (item) => typeof item === 'string' && item.length <= EDITORIAL_PREFERENCES_MAX_CHARS)) return false;
  if (!optional(value.revision, (revision) => record(revision)
    && ['rewrite', 'refine', 'selection'].includes(revision.kind)
    && optional(revision.instruction, string)
    && optional(revision.selectionRange, (range) => record(range) && Number.isInteger(range.start)
      && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start))) return false;
  if (!optional(value.review, (review) => record(review)
    && ['complete', 'unavailable'].includes(review.status) && string(review.summary)
    && Array.isArray(review.findings) && review.findings.every((finding) => record(finding)
      && ['omission', 'claim', 'addition', 'voice', 'preservation', 'editorial', 'local-check'].includes(finding.category)
      && ['info', 'warning', 'error'].includes(finding.severity) && string(finding.detail) && optional(finding.evidence, string))
    && strings(review.voiceObservations)
    && Array.isArray(review.localChecks) && review.localChecks.every((check) => record(check)
      && ['numbers', 'quotes', 'headings'].includes(check.kind) && typeof check.passed === 'boolean'
      && strings(check.missing) && strings(check.unexpected) && string(check.detail))
    && optional(review.modelUsed, string) && optional(review.error, string) && optional(review.durationMs, finite))) return false;
  if (!optional(value.modelSettings, (settings) => record(settings)
    && ['writingModel', 'writingReasoningLevel', 'analysisModel', 'analysisReasoningLevel'].every((key) => string(settings[key]))
    && optional(settings.model, string) && optional(settings.reasoningLevel, string))) return false;
  if (!optional(value.preservationSettings, (settings) => record(settings)
    && ['keepStructure', 'preserveNumbers', 'preserveQuotes', 'preserveTerms'].every((key) => typeof settings[key] === 'boolean')
    && ['revise_in_voice', 'preserve_verbatim'].includes(settings.headingTreatment) && string(settings.customLocks))) return false;
  if (!optional(value.toneAdjustments, (tone) => record(tone)
    && ['formality', 'enthusiasm', 'conciseness'].every((key) => finite(tone[key]))
    && optional(tone.enabled, (item) => typeof item === 'boolean'))) return false;
  if (!optional(value.stylisticAudit, (audit) => record(audit)
    && string(audit.cadenceChanges) && string(audit.structuralTweaks) && finite(audit.voiceAlignmentScore)
    && Array.isArray(audit.vocabularySubstitutions) && audit.vocabularySubstitutions.every((item) => record(item)
      && ['from', 'to', 'reason'].every((key) => string(item[key]))))) return false;
  if (!optional(value.styleSimilarity, (score) => record(score) && finite(score.overallPercentage)
    && string(score.explanation) && strings(score.strengths) && optional(score.deviationsNote, string)
    && record(score.breakdown) && ['cadenceMatch', 'vocabularyFidelity', 'toneConsistency', 'domainConformance'].every((key) => finite(score.breakdown[key])))) return false;
  // Saved domain metadata is retained as data; follow-up edits use the current profile.
  return optional(value.domainExpertise, record);
}

/** Older refinements reused an ID. Keep every saved version independently addressable. */
export function normalizeRewriteHistory(value: unknown): RewriteResult[] {
  if (!Array.isArray(value) || !value.every(isSavedRewrite)) {
    throw new Error('Saved version history could not be read.');
  }
  const usedIds = new Set<string>();
  const reservedIds = new Set(value.map((entry) => entry.id));
  return value.map((entry, index) => {
    let id = typeof entry.id === 'string' && entry.id ? entry.id : `legacy-${index}`;
    if (usedIds.has(id) || !entry.id) {
      const base = id;
      let suffix = index;
      do { id = `${base}-version-${suffix++}`; } while (usedIds.has(id) || reservedIds.has(id));
    }
    usedIds.add(id);
    return { ...entry, id, ...(!entry.review ? { historicalAssessment: true } : {}) };
  });
}

/** Preserve the outgoing active version, including its queued feedback, before switching. */
export function retainRewriteVersions(
  history: RewriteResult[],
  next: RewriteResult,
  current?: RewriteResult | null,
): RewriteResult[] {
  const existing = current
    ? history.some((entry) => entry.id === current.id)
      ? history.map((entry) => entry.id === current.id ? current : entry)
      : [current, ...history]
    : history;
  return [next, ...existing.filter((entry) => entry.id !== next.id)].slice(0, REWRITE_HISTORY_LIMIT);
}

export function revisionLabel(result: RewriteResult): string {
  if (result.revision?.kind === 'refine') return 'Quick adjustment';
  if (result.revision?.kind === 'selection') return 'Selection edit';
  if (result.revision?.kind === 'rewrite') return 'Full rewrite';
  return 'Saved version';
}

export function versionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not recorded' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

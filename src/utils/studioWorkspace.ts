import { EditorialPlanState, RewriteFeedbackItem, RewriteIntensity, RewriteResult } from '../types';
import { isRewriteFeedback, normalizeRewriteHistory } from './rewriteHistory';
import { DEFAULT_EDITORIAL_PREFERENCES } from '../writingPipeline';
import { isEditorialPlanState } from '../editorialPlan';

export const STUDIO_WORKSPACE_KEY = 'personascript_workspace_v1';

/** Current work only. The existing history key remains the owner of saved versions. */
export interface StudioWorkspace {
  editorialPlan?: EditorialPlanState;
  draftText: string;
  projectBrief: string;
  readerPurpose: string;
  editorialPreferences: string;
  customDirectives: string;
  rewriteIntensity: RewriteIntensity;
  rewriteResult: RewriteResult | null;
  usingSavedVersionContext: boolean;
  feedbackItems: RewriteFeedbackItem[];
}

export const EMPTY_STUDIO_WORKSPACE: StudioWorkspace = {
  draftText: '', projectBrief: '', readerPurpose: '', editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES, customDirectives: '', rewriteIntensity: 'faithful',
  rewriteResult: null, usingSavedVersionContext: false, feedbackItems: [],
};

export function parseStudioWorkspace(saved: string): StudioWorkspace {
  const value = JSON.parse(saved);
  if (!value || typeof value !== 'object'
    || typeof value.draftText !== 'string'
    || typeof value.projectBrief !== 'string'
    || (value.editorialPreferences !== undefined && typeof value.editorialPreferences !== 'string')
    || (value.readerPurpose !== undefined && typeof value.readerPurpose !== 'string')
    || (value.editorialPlan !== undefined && !isEditorialPlanState(value.editorialPlan))
    || typeof value.customDirectives !== 'string'
    || !['polish', 'faithful', 'transform'].includes(value.rewriteIntensity)
    || typeof value.usingSavedVersionContext !== 'boolean'
    || !isRewriteFeedback(value.feedbackItems)) {
    throw new Error('The saved working copy could not be read.');
  }
  return {
    ...(value.editorialPlan === undefined ? {} : { editorialPlan: value.editorialPlan }),
    draftText: value.draftText,
    projectBrief: value.projectBrief,
    readerPurpose: value.readerPurpose === undefined ? '' : value.readerPurpose,
    editorialPreferences: value.editorialPreferences === undefined ? DEFAULT_EDITORIAL_PREFERENCES : value.editorialPreferences,
    customDirectives: value.customDirectives,
    rewriteIntensity: value.rewriteIntensity,
    rewriteResult: value.rewriteResult === null ? null : normalizeRewriteHistory([value.rewriteResult])[0],
    usingSavedVersionContext: value.usingSavedVersionContext,
    feedbackItems: value.feedbackItems,
  };
}

export function readStudioWorkspace(storage: Pick<Storage, 'getItem'>): {
  workspace: StudioWorkspace;
  found: boolean;
  error: string | null;
} {
  try {
    const saved = storage.getItem(STUDIO_WORKSPACE_KEY);
    return { workspace: saved === null ? EMPTY_STUDIO_WORKSPACE : parseStudioWorkspace(saved), found: saved !== null, error: null };
  } catch {
    return {
      workspace: EMPTY_STUDIO_WORKSPACE, found: true,
      error: 'The saved working copy could not be read and has not been overwritten. Keep this page open and download your current work before leaving.',
    };
  }
}

export function saveStudioWorkspace(storage: Pick<Storage, 'setItem'>, workspace: StudioWorkspace): string | null {
  try {
    // setItem is atomic: a failed write leaves the last successful snapshot intact.
    storage.setItem(STUDIO_WORKSPACE_KEY, JSON.stringify(workspace));
    return null;
  } catch {
    return 'Your latest work could not be saved in this browser. Keep this page open and download a working copy before refreshing or leaving.';
  }
}

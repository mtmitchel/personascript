import { StudioWorkspace, EMPTY_STUDIO_WORKSPACE } from '../../src/utils/studioWorkspace';
import { DEFAULT_EDITORIAL_PREFERENCES } from '../../src/writingPipeline';
import { EditorialPlanState } from '../../src/types';

export const emptyWorkspaceFixture: StudioWorkspace = {
  ...EMPTY_STUDIO_WORKSPACE,
};

const v4PlanState: EditorialPlanState = {
  plan: {
    version: 4,
    openingJob: 'Lead with Section One.',
    items: [
      {
        paragraphRange: { from: 1, to: 2 },
        idea: 'Tighten first section',
        sourcePhrase: 'First paragraph with draft content.',
        decision: 'shorten',
        limit: 'Keep key metrics intact.',
      },
      {
        paragraphRange: { from: 3, to: 4 },
        idea: 'Condense second section',
        sourcePhrase: 'Second paragraph to tighten.',
        decision: 'cut',
        limit: '',
      },
    ],
    conflicts: [],
  },
  sources: {
    draft: '## Section One\n\nFirst paragraph with draft content.\n\n## Section Two\n\nSecond paragraph to tighten.',
    projectBrief: 'Test brief for the v4 plan.',
    readerPurpose: 'Professional readers looking for concise advice.',
    editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES,
    customInstructions: '',
  },
  approved: false,
  modelUsed: 'planning-model',
};

export const draftWithV4PlanFixture: StudioWorkspace = {
  draftText: '## Section One\n\nFirst paragraph with draft content.\n\n## Section Two\n\nSecond paragraph to tighten.',
  projectBrief: 'Test brief for the v4 plan.',
  readerPurpose: 'Professional readers looking for concise advice.',
  editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES,
  customDirectives: '',
  rewriteIntensity: 'faithful',
  rewriteResult: null,
  usingSavedVersionContext: false,
  feedbackItems: [],
  editorialPlan: v4PlanState,
};

const approvedPlanState: EditorialPlanState = {
  plan: {
    version: 4,
    openingJob: 'Open with main thesis.',
    items: [
      {
        paragraphRange: { from: 1, to: 2 },
        idea: 'Polish draft',
        sourcePhrase: 'First paragraph of original draft.',
        decision: 'shorten',
        limit: '',
        response: 'accepted',
      },
    ],
    conflicts: [],
  },
  sources: {
    draft: 'First paragraph of original draft.\n\nSecond paragraph of original draft.',
    projectBrief: 'Project brief.',
    readerPurpose: 'General audience.',
    editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES,
    customInstructions: '',
  },
  approved: true,
  modelUsed: 'planning-model',
};

export const approvedPlanWithRewriteFixture: StudioWorkspace = {
  draftText: 'First paragraph of original draft.\n\nSecond paragraph of original draft.',
  projectBrief: 'Project brief.',
  readerPurpose: 'General audience.',
  editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES,
  customDirectives: '',
  rewriteIntensity: 'faithful',
  usingSavedVersionContext: true,
  feedbackItems: [],
  editorialPlan: approvedPlanState,
  rewriteResult: {
    id: 'rewrite-ver-1234',
    profileId: 'profile-1',
    profileName: 'Authentic Voice',
    intensity: 'faithful',
    originalText: 'First paragraph of original draft.\n\nSecond paragraph of original draft.',
    projectBrief: 'Project brief.',
    readerPurpose: 'General audience.',
    editorialPreferences: DEFAULT_EDITORIAL_PREFERENCES,
    rewrittenText: 'First rewritten paragraph with polished prose.\n\nSecond rewritten paragraph.',
    wordCountOriginal: 8,
    wordCountRewritten: 8,
    createdAt: '2026-09-11T12:00:00Z',
    changesExplanation: '',
    editorialPlan: approvedPlanState,
    review: {
      status: 'complete',
      summary: 'Review complete with two findings.',
      findings: [
        {
          category: 'claim',
          severity: 'warning',
          detail: 'Claim 1 lacks source attribution.',
          evidence: 'First rewritten paragraph',
        },
        {
          category: 'editorial',
          severity: 'info',
          detail: 'Terminology in paragraph 2 differs from draft.',
          evidence: 'Second rewritten paragraph',
        },
      ],
      voiceObservations: [],
      localChecks: [
        {
          kind: 'numbers',
          passed: true,
          missing: [],
          unexpected: [],
          detail: 'All counts matched.',
        },
      ],
    },
  },
};

export type FileType = 'pdf' | 'docx' | 'txt' | 'md' | 'pasted' | 'portfolio' | 'url';

export interface LinguisticAnalysis {
  summary: string;
  wordChoice: {
    vocabularyLevel: string;
    sensoryRichness: number; // 1-100
    favoredRegisters: string[];
    lexicalDensity: string;
    avoidedPatterns: string[];
    keyPhrases: string[];
  };
  sentenceStructure: {
    avgSentenceLength: number;
    lengthDistribution: {
      shortUnder10: number; // %
      medium10to25: number; // %
      longOver25: number; // %
    };
    syntaxType: string;
    activeVoicePercentage: number;
    punctuationSignatures: {
      emDashes: 'frequent' | 'moderate' | 'rare';
      semicolons: 'frequent' | 'moderate' | 'rare';
      parentheticals: 'frequent' | 'moderate' | 'rare';
      fragments: 'frequent' | 'moderate' | 'rare';
    };
    sentenceOpeners: string[];
  };
  rhythmAndPacing: {
    cadence: string;
    burstinessScore: number; // 1-100 (sentence length variation)
    paragraphLength: string;
    transitionStyle: string;
  };
  voice: {
    persona: string;
    perspective: 'first_person' | 'third_person' | 'second_person_inclusive' | 'mixed';
    intimacy: number; // 1-100
    ironyLevel: number; // 1-100
    authorityPosture: string;
  };
  tone: {
    formalityScore: number; // 1-100
    warmthScore: number; // 1-100
    confidenceScore: number; // 1-100
    emotionalResonance: string;
    primaryAttributes: string[];
  };
  rules: string[];
  notableExcerpts: Array<{
    quote: string;
    commentary: string;
  }>;
}

export interface WritingSample {
  id: string;
  title: string;
  fileType: FileType;
  fileName?: string;
  content: string;
  wordCount: number;
  charCount: number;
  createdAt: string;
  analysis?: LinguisticAnalysis;
  analyzing?: boolean;
  analysisError?: string;
  enabled: boolean;
  isExample?: boolean;
}

export interface ProfileMetrics {
  formality: number; // 1-100
  avgSentenceLength: number;
  sentenceLengthVariance: number; // 1-100
  lexicalSophistication: number; // 1-100
  warmth: number; // 1-100
  directness: number; // 1-100
  activeVoiceRatio: number; // 1-100
  metaphorDensity: number; // 1-100
}

export type ConceptSourceStatus = 'supported' | 'adjacent';

export interface ConceptAnnotation {
  status: ConceptSourceStatus;
  explanation?: string;
}

export interface DomainTopic {
  id: string;
  name: string; // e.g. "Content Design & UX Copywriting", "Monetization", "AI Translation", "AI Writing Assistance"
  category?: 'discipline' | 'intersecting' | 'topic';
  description?: string;
  keyTerminology: string[];
  conceptAnnotations?: Record<string, ConceptAnnotation>;
  conventions: string[];
  enabled: boolean;
}

export interface ProductReference {
  id: string;
  name: string;
  notes: string;
  enabled: boolean;
}

export interface DomainExpertise {
  enabled: boolean;
  field: string;
  disciplines?: string[]; // Core disciplines (e.g. ["UX Copywriting", "Content Design"])
  topics?: DomainTopic[]; // Multi-discipline & intersecting topics (e.g. Monetization, AI translation, AI writing assistance)
  keyTerminology: string[];
  conventions: string[];
  audienceContext: string;
  customNotes?: string;
  productKnowledge?: ProductReference[];
}

export interface StyleProfile {
  appliedFeedbackIds?: string[];
  retiredFeedbackIds?: string[];
  id: string;
  name: string;
  description: string;
  sampleIds: string[];
  updatedAt: string;
  metrics: ProfileMetrics;
  voiceManifesto: string;
  synthesizedGuidelines: {
    doList: string[];
    dontList: string[];
    signatureHabits: string[];
    vocabularyPreferences: string[];
    pacingGuide: string;
  };
  customDirectives: string;
  domainExpertise?: DomainExpertise;
}

export type RewriteIntensity = 'polish' | 'faithful' | 'transform';

export interface EditorialPlan {
  /**
   * Older saved plans remain readable. Version 2 anchors each item to one
   * paragraph and carries conflicts per item; version 3 plans by section
   * (a contiguous paragraph range) and lists conflicts once, at the top.
   * Version 4 keeps version 3's shape but plans by passage inside each
   * section: one item per distinct claim or idea that needs its own treatment
   * or its own limit; `limit` is required for any passage that carries a
   * claim about results, user behaviour, causality, ownership, comparative
   * importance, intention, or degree. Sections are derived from the draft's
   * headings at display time, not stored.
   */
  version?: 2 | 3 | 4;
  openingJob: string;
  items: {
    /** Version 2: the single paragraph this item anchors to. */
    paragraphId?: number;
    /** Version 3: the contiguous paragraphs this decision covers, inclusive. */
    paragraphRange?: { from: number; to: number };
    idea: string;
    /** Version 3: why this reader is better off; required for shorten and cut. */
    reason?: string;
    sourcePhrase: string;
    decision: 'keep' | 'shorten' | 'cut';
    /** Version 3 leaves this empty when the standing rules already cover the passage. */
    limit: string;
    /** Version 2 only. */
    sourceConflict?: { draftQuote: string; briefQuote: string };
    /**
     * Version 3: the author's answer to this suggestion. Accepted and pending
     * suggestions are executed as written; rejected and ignored ones as keep.
     */
    response?: 'accepted' | 'rejected' | 'ignored';
  }[];
  /**
   * Version 3: every evidenced draft/brief contradiction, asked once. The
   * author answers before approval; the writer receives the answer as a
   * decision, never as a silent preference.
   */
  conflicts?: EditorialConflict[];
  /**
   * Version 3: the author's own instructions for selected passages. They take
   * precedence over the decision covering that passage.
   */
  requests?: EditorialRequest[];
}

export interface EditorialRequest {
  paragraphRange: { from: number; to: number };
  /** The passage the author selected, verbatim. */
  sourcePhrase: string;
  /** What should change, and why, in the author's words. */
  instruction: string;
}

export interface EditorialConflict {
  draftQuote: string;
  briefQuote: string;
  /** One plain question the author can answer with either source. */
  question: string;
  resolution?: 'draft' | 'brief';
}

/** The exact source context reviewed by the user; edits require approval again. */
export interface EditorialPlanState {
  plan: EditorialPlan;
  sources: { draft: string; projectBrief: string; readerPurpose: string; editorialPreferences?: string; customInstructions?: string };
  approved: boolean;
  modelUsed?: string;
}

export type HeadingTreatment = 'revise_in_voice' | 'preserve_verbatim';

export interface PreservationSettings {
  keepStructure: boolean;
  headingTreatment: HeadingTreatment;
  preserveNumbers: boolean;
  preserveQuotes: boolean;
  preserveTerms: boolean;
  customLocks: string;
}

export interface SelectionRange {
  start: number;
  end: number;
}

export interface ToneAdjustments {
  formality: number; // 0 (Informal and Conversational) - 100 (Formal and Treatise-grade)
  enthusiasm: number; // 0 (Subdued and Analytical) - 100 (Energetic and Inspiring)
  conciseness: number; // 0 (Expansive and Lyrical) - 100 (Direct and Razor-sharp)
  /** Sliders are retained between runs but only affect writing when enabled. */
  enabled?: boolean;
}

export type ReviewStatus = 'complete' | 'unavailable';

export type ReviewFindingSeverity = 'info' | 'warning' | 'error';

export interface ReviewFinding {
  category: ReviewFindingCategory;
  severity: ReviewFindingSeverity;
  detail: string;
  evidence?: string;
}

/** Categories retained by the review wire contract, including legacy values. */
export type ReviewFindingCategory =
  | 'omission'
  | 'claim'
  | 'addition'
  | 'voice'
  | 'preservation'
  | 'editorial'
  | 'local-check';

export interface LocalPreservationCheck {
  kind: 'numbers' | 'quotes' | 'headings';
  passed: boolean;
  missing: string[];
  unexpected: string[];
  detail: string;
}

export interface WritingReview {
  status: ReviewStatus;
  summary: string;
  findings: ReviewFinding[];
  voiceObservations: string[];
  localChecks: LocalPreservationCheck[];
  modelUsed?: string;
  durationMs?: number;
  error?: string;
  /** Finding keys the author chose to ignore; optional so saved versions stay readable. */
  ignoredFindings?: string[];
}

export type FeedbackTag =
  | 'too_formal'
  | 'too_casual'
  | 'not_my_voice'
  | 'good'
  | 'too_verbose'
  | 'awkward_cadence'
  | 'domain_inaccurate'
  | 'custom';

export interface RewriteFeedbackItem {
  saveStatus?: 'pending' | 'failed';
  id: string;
  selectedText: string;
  tag: FeedbackTag;
  label: string;
  note?: string;
  createdAt: string;
}

export interface StyleSimilarityScore {
  overallPercentage: number; // 0-100
  explanation: string;
  breakdown: {
    cadenceMatch: number; // 0-100
    vocabularyFidelity: number; // 0-100
    toneConsistency: number; // 0-100
    domainConformance: number; // 0-100
  };
  strengths: string[];
  deviationsNote?: string;
}

export interface VocabularySubstitution {
  from: string;
  to: string;
  reason: string;
}

export interface StylisticAudit {
  cadenceChanges: string;
  structuralTweaks: string;
  vocabularySubstitutions: VocabularySubstitution[];
  voiceAlignmentScore: number;
}

export interface RewriteResult {
  id: string;
  editorialPlan?: EditorialPlanState;
  parentId?: string;
  revision?: {
    kind: 'rewrite' | 'refine' | 'selection';
    instruction?: string;
    selectionRange?: SelectionRange;
  };
  /** Selected settings at generation time; result model attribution is stored separately. */
  modelSettings?: ModelSettings;
  profileId: string;
  profileName: string;
  intensity: RewriteIntensity;
  originalText: string;
  rewrittenText: string;
  wordCountOriginal: number;
  wordCountRewritten: number;
  changesExplanation: string;
  /** Kept optional so historical records made by the old scorer still render. */
  stylisticAudit?: StylisticAudit;
  styleSimilarity?: StyleSimilarityScore;
  review?: WritingReview;
  historicalAssessment?: boolean;
  toneAdjustments?: ToneAdjustments;
  domainExpertise?: DomainExpertise;
  preservationSettings?: PreservationSettings;
  feedbackItems?: RewriteFeedbackItem[];
  createdAt: string;
  customInstructions?: string;
  preservationLocks?: string;
  projectBrief?: string;
  /** Independent reader and purpose context for the rewrite, if supplied. */
  readerPurpose?: string;
  editorialPreferences?: string;
  modelUsed?: string;
  writingModelUsed?: string;
  analysisModelUsed?: string;
  writingDurationMs?: number;
  durationMs?: number;
}

export interface LearnFromFeedbackResponse {
  updatedProfile: StyleProfile;
  learningSummary: string[];
  rulesAdded: string[];
  metricAdjustments: Array<{ metric: string; delta: string }>;
}

export type GeminiModelChoice =
  | 'gemini-3.8-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.6-flash'
  | 'gemini-3.1-pro-preview';

export type ModelChoice = GeminiModelChoice | `openai:${string}` | `openrouter:${string}`;

// Providers can advertise new effort names without an app release. Values are
// validated as bounded identifiers before being sent, and never remapped.
export type ReasoningLevelChoice = string;

export interface ModelSettings {
  writingModel: ModelChoice;
  writingReasoningLevel: ReasoningLevelChoice;
  analysisModel: ModelChoice;
  analysisReasoningLevel: ReasoningLevelChoice;
  model?: ModelChoice;
  reasoningLevel?: ReasoningLevelChoice;
}

export interface DiscoveredPortfolioPiece {
  id: string;
  title: string;
  url?: string;
  excerpt: string;
  content: string;
  wordCount: number;
  detectedType: string;
  alignmentScore: number; // 0-100
  alignmentRationale: string;
  recommended: boolean;
  targetAudienceMatch?: string;
}

export interface PortfolioDiscoveryResult {
  siteTitle: string;
  siteUrl: string;
  targetAudience: string;
  writingType?: string;
  pieces: DiscoveredPortfolioPiece[];
  agentSummary: string;
}

export interface GenerateDomainKnowledgeRequest {
  field?: string;
  disciplines?: string[];
  existingTopics?: string[];
  targetTopic?: { name: string; category: 'discipline' | 'intersecting' };
  draft?: string;
  projectBrief?: string;
  model?: ModelChoice;
  reasoningLevel?: ReasoningLevelChoice;
}

export interface GenerateDomainKnowledgeResponse {
  topics: DomainTopic[];
}

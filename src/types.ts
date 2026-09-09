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
  enabled: boolean;
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
  category: 'omission' | 'claim' | 'addition' | 'voice' | 'preservation' | 'local-check';
  severity: ReviewFindingSeverity;
  detail: string;
  evidence?: string;
}

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

export type ReasoningLevelChoice = 'auto' | 'minimal' | 'low' | 'high';

export interface ModelSettings {
  writingModel: GeminiModelChoice;
  writingReasoningLevel: ReasoningLevelChoice;
  analysisModel: GeminiModelChoice;
  analysisReasoningLevel: ReasoningLevelChoice;
  model?: GeminiModelChoice;
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
  model?: GeminiModelChoice;
  reasoningLevel?: ReasoningLevelChoice;
}

export interface GenerateDomainKnowledgeResponse {
  topics: DomainTopic[];
}

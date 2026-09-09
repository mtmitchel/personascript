import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  WritingSample,
  StyleProfile,
  RewriteResult,
  RewriteIntensity,
  ToneAdjustments,
  DomainExpertise,
  RewriteFeedbackItem,
  LearnFromFeedbackResponse,
  GeminiModelChoice,
  ReasoningLevelChoice,
  ModelSettings,
  PreservationSettings,
  HeadingTreatment,
  FeedbackTag,
  SelectionRange,
} from '../types';
import { DEFAULT_SAMPLES, DEFAULT_PROFILE, SAMPLE_DRAFT_TO_REWRITE } from '../data/defaultSamples';
import { normalizeDomainExpertise, normalizePreservationSettings, validateProjectBrief } from '../writingPipeline';

export type NavigationTab = 'samples' | 'profile' | 'draft-brief' | 'domain' | 'studio';

interface WritingAssistantContextType {
  samples: WritingSample[];
  activeProfile: StyleProfile;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  draftText: string;
  setDraftText: (text: string) => void;
  isUploadingDraft: boolean;
  draftUploadError: string | null;
  uploadDraft: (files: File[]) => Promise<void>;
  useDraftAndBrief: boolean;
  setUseDraftAndBrief: (enabled: boolean) => void;
  projectBrief: string;
  setProjectBrief: (brief: string) => void;
  isUploadingBrief: boolean;
  briefUploadError: string | null;
  uploadProjectBrief: (file: File) => Promise<void>;
  rewriteIntensity: RewriteIntensity;
  setRewriteIntensity: (intensity: RewriteIntensity) => void;
  preservationLocks: string;
  setPreservationLocks: (locks: string) => void;
  preservationSettings: PreservationSettings;
  setPreservationSettings: React.Dispatch<React.SetStateAction<PreservationSettings>>;
  updatePreservationSettings: (updates: Partial<PreservationSettings>) => void;
  customDirectives: string;
  setCustomDirectives: (directives: string) => void;
  isRewriting: boolean;
  rewriteResult: RewriteResult | null;
  setRewriteResult: (result: RewriteResult | null) => void;
  rewriteHistory: RewriteResult[];
  isSynthesizingProfile: boolean;
  activeSampleId: string | null;
  setActiveSampleId: (id: string | null) => void;

  // Model and Reasoning Settings
  modelSettings: ModelSettings;
  setModelSettings: React.Dispatch<React.SetStateAction<ModelSettings>>;
  updateWritingModel: (model: GeminiModelChoice) => void;
  updateWritingReasoningLevel: (level: ReasoningLevelChoice) => void;
  updateAnalysisModel: (model: GeminiModelChoice) => void;
  updateAnalysisReasoningLevel: (level: ReasoningLevelChoice) => void;
  updateModel: (model: GeminiModelChoice) => void;
  updateReasoningLevel: (level: ReasoningLevelChoice) => void;

  // Tone and Voice Sliders
  toneAdjustments: ToneAdjustments;
  setToneAdjustments: React.Dispatch<React.SetStateAction<ToneAdjustments>>;
  resetToneAdjustments: () => void;

  // Domain Expertise
  domainExpertise: DomainExpertise;
  setDomainExpertise: React.Dispatch<React.SetStateAction<DomainExpertise>>;
  updateDomainExpertise: (expertise: DomainExpertise | ((prev: DomainExpertise) => DomainExpertise)) => void;

  // Feedback Mechanism
  feedbackItems: RewriteFeedbackItem[];
  addFeedbackItem: (item: Omit<RewriteFeedbackItem, 'id' | 'createdAt'>) => void;
  removeFeedbackItem: (id: string) => void;
  clearFeedbackItems: () => void;
  isLearningFeedback: boolean;
  learnFromFeedback: () => Promise<LearnFromFeedbackResponse>;

  // Actions
  addSample: (sample: Omit<WritingSample, 'id' | 'createdAt' | 'enabled'>) => Promise<WritingSample>;
  analyzeSample: (sampleId: string) => Promise<void>;
  toggleSample: (sampleId: string) => void;
  deleteSample: (sampleId: string) => void;
  restoreDefaultSamples: () => void;
  synthesizeProfileFromActiveSamples: () => Promise<void>;
  updateActiveProfile: (profile: StyleProfile) => void;
  performRewrite: () => Promise<void>;
  applyQuickRefine: (instruction: string) => Promise<void>;
  editSelection: (
    selectedText: string,
    instruction: string,
    tag?: FeedbackTag,
    alsoSaveToProfile?: boolean,
    selectionRange?: SelectionRange
  ) => Promise<{ replacementText: string; explanation: string }>;
  loadSampleDraft: () => void;
  resetAllData: () => void;
}

const STORAGE_KEY_SAMPLES = 'personascript_samples_v2';
const STORAGE_KEY_PROFILE = 'personascript_profile_v2';
const STORAGE_KEY_HISTORY = 'personascript_history_v2';
const STORAGE_KEY_TONE = 'personascript_tone_v2';
const STORAGE_KEY_MODEL = 'personascript_model_settings_v1';
const STORAGE_KEY_PRESERVATION = 'personascript_preservation_v2';

export const DEFAULT_PRESERVATION_SETTINGS: PreservationSettings = {
  keepStructure: true,
  headingTreatment: 'revise_in_voice',
  preserveNumbers: true,
  preserveQuotes: true,
  preserveTerms: false,
  customLocks: 'Keep all core metrics, statistics, and organizational roles intact.',
};

const DEFAULT_TONE_ADJUSTMENTS: ToneAdjustments = {
  formality: 65,
  enthusiasm: 50,
  conciseness: 50,
  enabled: false,
};

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  writingModel: 'gemini-3.8-flash',
  writingReasoningLevel: 'auto',
  analysisModel: 'gemini-3.1-pro-preview',
  analysisReasoningLevel: 'auto',
  model: 'gemini-3.8-flash',
  reasoningLevel: 'auto',
};

const WritingAssistantContext = createContext<WritingAssistantContextType | undefined>(undefined);

async function readSourceDocument(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['md', 'txt', 'docx', 'pdf'];
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error(`Unsupported file type (.${extension || 'unknown'}). Please upload a .md, .txt, .docx, or .pdf file.`);
  }

  let extractedText = '';
  if (extension === 'docx' || extension === 'pdf') {
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/extract-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData: base64Data,
        fileType: extension,
        fileName: file.name,
        localOnly: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to extract text from ${file.name}.`);
    }

    const data = await res.json();
    if (typeof data.text !== 'string') throw new Error('The document response did not contain text.');
    extractedText = data.text;
  } else {
    const text = await file.text();
    extractedText = text;
  }

  if (!extractedText.trim()) {
    throw new Error(`The uploaded file “${file.name}” contains no usable text. The previous input was preserved.`);
  }
  return extractedText;
}

export const WritingAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [samples, setSamples] = useState<WritingSample[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SAMPLES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read saved samples from storage', e);
    }
    return DEFAULT_SAMPLES;
  });

  const [activeProfile, setActiveProfile] = useState<StyleProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.domainExpertise && DEFAULT_PROFILE.domainExpertise) {
          parsed.domainExpertise = DEFAULT_PROFILE.domainExpertise;
        } else if (parsed.domainExpertise) {
          parsed.domainExpertise = normalizeDomainExpertise(parsed.domainExpertise);
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read saved profile from storage', e);
    }
    return DEFAULT_PROFILE;
  });

  const [rewriteHistory, setRewriteHistory] = useState<RewriteResult[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed)
          ? parsed.map((result) => result.review ? result : { ...result, historicalAssessment: true })
          : [];
      }
    } catch (e) {
      console.warn('Could not read saved history from storage', e);
    }
    return [];
  });

  const [toneAdjustments, setToneAdjustments] = useState<ToneAdjustments>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TONE);
      if (saved) return { ...DEFAULT_TONE_ADJUSTMENTS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Could not read saved tone adjustments', e);
    }
    return DEFAULT_TONE_ADJUSTMENTS;
  });

  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MODEL);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          writingModel: parsed.writingModel || parsed.model || 'gemini-3.8-flash',
          writingReasoningLevel: parsed.writingReasoningLevel || parsed.reasoningLevel || 'auto',
          analysisModel: parsed.analysisModel || 'gemini-3.1-pro-preview',
          analysisReasoningLevel: parsed.analysisReasoningLevel || 'auto',
          model: parsed.writingModel || parsed.model || 'gemini-3.8-flash',
          reasoningLevel: parsed.writingReasoningLevel || parsed.reasoningLevel || 'auto',
        };
      }
    } catch (e) {
      console.warn('Could not read saved model settings', e);
    }
    return DEFAULT_MODEL_SETTINGS;
  });

  const updateWritingModel = (writingModel: GeminiModelChoice) => {
    setModelSettings((prev) => ({ ...prev, writingModel, model: writingModel }));
  };

  const updateWritingReasoningLevel = (writingReasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, writingReasoningLevel, reasoningLevel: writingReasoningLevel }));
  };

  const updateAnalysisModel = (analysisModel: GeminiModelChoice) => {
    setModelSettings((prev) => ({ ...prev, analysisModel }));
  };

  const updateAnalysisReasoningLevel = (analysisReasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, analysisReasoningLevel }));
  };

  const updateModel = (model: GeminiModelChoice) => {
    setModelSettings((prev) => ({ ...prev, model, writingModel: model }));
  };

  const updateReasoningLevel = (reasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, reasoningLevel, writingReasoningLevel: reasoningLevel }));
  };

  const domainExpertise = activeProfile.domainExpertise || DEFAULT_PROFILE.domainExpertise!;

  const [activeTab, setActiveTab] = useState<NavigationTab>('studio');
  const [draftText, setDraftText] = useState<string>('');
  const [isUploadingDraft, setIsUploadingDraft] = useState(false);
  const [draftUploadError, setDraftUploadError] = useState<string | null>(null);
  const draftUploadRef = useRef<symbol | null>(null);
  const [useDraftAndBrief, setUseDraftAndBrief] = useState(true);
  const [projectBrief, setProjectBrief] = useState<string>('');
  const [isUploadingBrief, setIsUploadingBrief] = useState(false);
  const [briefUploadError, setBriefUploadError] = useState<string | null>(null);
  const briefUploadRef = useRef<symbol | null>(null);
  const [rewriteIntensity, setRewriteIntensity] = useState<RewriteIntensity>('faithful');

  const [preservationSettings, setPreservationSettings] = useState<PreservationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRESERVATION);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_PRESERVATION_SETTINGS,
          ...normalizePreservationSettings(parsed, parsed.customLocks || ''),
        };
      }
    } catch (e) {
      console.warn('Could not read saved preservation settings', e);
    }
    return DEFAULT_PRESERVATION_SETTINGS;
  });

  const [preservationLocks, setPreservationLocks] = useState<string>(
    () => preservationSettings.customLocks || DEFAULT_PRESERVATION_SETTINGS.customLocks
  );

  const updatePreservationSettings = (updates: Partial<PreservationSettings>) => {
    setPreservationSettings((prev) => {
      const next = { ...prev, ...updates };
      if (updates.customLocks !== undefined) {
        setPreservationLocks(updates.customLocks);
      }
      return next;
    });
  };

  const handleSetPreservationLocks = (locks: string) => {
    setPreservationLocks(locks);
    setPreservationSettings((prev) => ({ ...prev, customLocks: locks }));
  };

  const [customDirectives, setCustomDirectives] = useState<string>('');
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const writingOperationLock = useRef(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [isSynthesizingProfile, setIsSynthesizingProfile] = useState<boolean>(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>('sample-1');

  // Feedback state
  const [feedbackItems, setFeedbackItems] = useState<RewriteFeedbackItem[]>([]);
  const [isLearningFeedback, setIsLearningFeedback] = useState<boolean>(false);

  const updateDraftText = (text: string) => {
    if (draftUploadRef.current) return;
    setDraftText(text);
    setDraftUploadError(null);
  };

  const uploadDraft = async (files: File[]) => {
    if (!files.length || draftUploadRef.current || writingOperationLock.current) return;
    const uploadToken = Symbol();
    draftUploadRef.current = uploadToken;
    setIsUploadingDraft(true);
    setDraftUploadError(null);
    try {
      const texts: string[] = [];
      for (const file of files) texts.push(await readSourceDocument(file));
      if (draftUploadRef.current !== uploadToken) return;
      setDraftText(texts.join('\n\n---\n\n'));
    } catch (error: any) {
      if (draftUploadRef.current === uploadToken) setDraftUploadError(error.message || 'Failed to upload draft.');
    } finally {
      if (draftUploadRef.current === uploadToken) {
        draftUploadRef.current = null;
        setIsUploadingDraft(false);
      }
    }
  };

  const updateProjectBrief = (text: string) => {
    if (briefUploadRef.current) return;
    setProjectBrief(text);
    setBriefUploadError(null);
  };

  const uploadProjectBrief = async (file: File) => {
    if (!file || briefUploadRef.current || writingOperationLock.current) return;
    const uploadToken = Symbol();
    briefUploadRef.current = uploadToken;
    setIsUploadingBrief(true);
    setBriefUploadError(null);

    try {
      const extractedText = await readSourceDocument(file);

      validateProjectBrief(extractedText);
      if (briefUploadRef.current !== uploadToken) return;
      setProjectBrief(extractedText);
      setBriefUploadError(null);
    } catch (err: any) {
      if (briefUploadRef.current === uploadToken) setBriefUploadError(err.message || 'Failed to upload brief document.');
    } finally {
      if (briefUploadRef.current === uploadToken) {
        briefUploadRef.current = null;
        setIsUploadingBrief(false);
      }
    }
  };

  const beginWritingOperation = () => {
    if (draftUploadRef.current || briefUploadRef.current) throw new Error('Wait for draft and brief uploads to finish.');
    validateProjectBrief(projectBrief);
    if (writingOperationLock.current) return false;
    writingOperationLock.current = true;
    setIsRewriting(true);
    return true;
  };

  const endWritingOperation = () => {
    writingOperationLock.current = false;
    setIsRewriting(false);
  };

  // Persistence effects
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAMPLES, JSON.stringify(samples));
    } catch (e) {
      console.error('Error saving samples to storage', e);
    }
  }, [samples]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(activeProfile));
    } catch (e) {
      console.error('Error saving profile to storage', e);
    }
  }, [activeProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(rewriteHistory));
    } catch (e) {
      console.error('Error saving history to storage', e);
    }
  }, [rewriteHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TONE, JSON.stringify(toneAdjustments));
    } catch (e) {
      console.error('Error saving tone adjustments', e);
    }
  }, [toneAdjustments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRESERVATION, JSON.stringify(preservationSettings));
    } catch (e) {
      console.error('Error saving preservation settings', e);
    }
  }, [preservationSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MODEL, JSON.stringify(modelSettings));
    } catch (e) {
      console.error('Error saving model settings', e);
    }
  }, [modelSettings]);

  const resetToneAdjustments = () => {
    setToneAdjustments({
      formality: activeProfile.metrics?.formality || 65,
      enthusiasm: 50,
      conciseness: 50,
    });
  };

  const updateDomainExpertise = (
    newExpertise: DomainExpertise | ((prev: DomainExpertise) => DomainExpertise)
  ) => {
    setActiveProfile((prevProfile) => {
      const baseExpertise = prevProfile.domainExpertise || domainExpertise;
      const resolved = typeof newExpertise === 'function' ? newExpertise(baseExpertise) : newExpertise;
      const normalized = normalizeDomainExpertise(resolved);
      return {
        ...prevProfile,
        domainExpertise: normalized,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const setDomainExpertise = updateDomainExpertise;

  const addFeedbackItem = (item: Omit<RewriteFeedbackItem, 'id' | 'createdAt'>) => {
    const newItem: RewriteFeedbackItem = {
      ...item,
      id: `fb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setFeedbackItems((prev) => [...prev, newItem]);
  };

  const removeFeedbackItem = (id: string) => {
    setFeedbackItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearFeedbackItems = () => {
    setFeedbackItems([]);
  };

  const learnFromFeedback = async (): Promise<LearnFromFeedbackResponse> => {
    if (feedbackItems.length === 0) {
      throw new Error('No feedback items to learn from.');
    }
    if (!rewriteResult) {
      throw new Error('No active rewrite result.');
    }

    setIsLearningFeedback(true);
    try {
      const res = await fetch('/api/learn-from-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackItems,
          profile: activeProfile,
          rewrittenText: rewriteResult.rewrittenText,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update profile from feedback');
      }

      const data: LearnFromFeedbackResponse = await res.json();
      setActiveProfile((current) => ({
        ...data.updatedProfile,
        domainExpertise: current.domainExpertise,
      }));
      return data;
    } finally {
      setIsLearningFeedback(false);
    }
  };

  const addSample = async (sampleData: Omit<WritingSample, 'id' | 'createdAt' | 'enabled'>): Promise<WritingSample> => {
    const newSample: WritingSample = {
      ...sampleData,
      id: `sample-${Date.now()}`,
      createdAt: new Date().toISOString(),
      enabled: true,
      analyzing: true,
    };

    setSamples((prev) => [newSample, ...prev]);
    setActiveSampleId(newSample.id);

    // Trigger analysis immediately
    try {
      const res = await fetch('/api/analyze-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSample.title,
          text: newSample.content,
          fileType: newSample.fileType,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to analyze sample');
      }

      const analysis = await res.json();

      setSamples((prev) =>
        prev.map((s) => (s.id === newSample.id ? { ...s, analysis, analyzing: false } : s))
      );

      return { ...newSample, analysis, analyzing: false };
    } catch (e: any) {
      console.error('Failed sample analysis:', e);
      setSamples((prev) =>
        prev.map((s) => (s.id === newSample.id ? { ...s, analyzing: false } : s))
      );
      throw e;
    }
  };

  const analyzeSample = async (sampleId: string): Promise<void> => {
    const target = samples.find((s) => s.id === sampleId);
    if (!target) return;

    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, analyzing: true } : s))
    );

    try {
      const res = await fetch('/api/analyze-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: target.title,
          text: target.content,
          fileType: target.fileType,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const analysis = await res.json();
      setSamples((prev) =>
        prev.map((s) => (s.id === sampleId ? { ...s, analysis, analyzing: false } : s))
      );
    } catch (e) {
      setSamples((prev) =>
        prev.map((s) => (s.id === sampleId ? { ...s, analyzing: false } : s))
      );
      throw e;
    }
  };

  const toggleSample = (sampleId: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const deleteSample = (sampleId: string) => {
    setSamples((prev) => {
      const remaining = prev.filter((s) => s.id !== sampleId);
      if (activeSampleId === sampleId) {
        setActiveSampleId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const restoreDefaultSamples = () => {
    setSamples(DEFAULT_SAMPLES);
    setActiveSampleId(DEFAULT_SAMPLES[0]?.id || null);
  };

  const synthesizeProfileFromActiveSamples = async () => {
    const activeSamples = samples.filter((s) => s.enabled);
    if (activeSamples.length === 0) {
      throw new Error('Please enable at least one writing sample to build a profile.');
    }

    setIsSynthesizingProfile(true);
    try {
      const res = await fetch('/api/synthesize-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: activeSamples,
          currentProfile: activeProfile,
          profileName: activeProfile.name,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Profile synthesis failed');
      }

      const newProfile: StyleProfile = await res.json();
      // A profile request must not overwrite knowledge edited while it was running.
      setActiveProfile((current) => ({
        ...newProfile,
        domainExpertise: current.domainExpertise,
        customDirectives: current.customDirectives,
      }));
    } finally {
      setIsSynthesizingProfile(false);
    }
  };

  const updateActiveProfile = (profile: StyleProfile) => {
    const normalized = profile.domainExpertise
      ? { ...profile, domainExpertise: normalizeDomainExpertise(profile.domainExpertise) }
      : profile;
    setActiveProfile(normalized);
  };

  const performRewrite = async () => {
    if (!draftText || draftText.trim().length < 10) {
      throw new Error('Please enter draft text to rewrite (minimum 10 characters).');
    }

    if (!beginWritingOperation()) return;
    try {
      const activeSamples = samples.filter((s) => s.enabled);
      if (activeSamples.length === 0) {
        throw new Error('Enable at least one writing sample before rewriting.');
      }
      const corpus = activeSamples.map(({ id, title, content, enabled }) => ({ id, title, content, enabled }));
      const currentBrief = projectBrief;

      const res = await fetch('/api/rewrite-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draftText,
          projectBrief: currentBrief || undefined,
          profile: activeProfile,
          intensity: rewriteIntensity,
          preservationLocks,
          preservationSettings,
          customInstructions: customDirectives,
          toneAdjustments,
          toneEnabled: Boolean(toneAdjustments.enabled),
          domainExpertise,
          samples: corpus,
          model: modelSettings.writingModel || 'gemini-3.8-flash',
          reasoningLevel: modelSettings.writingReasoningLevel || 'auto',
          analysisModel: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          analysisReasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to rewrite draft');
      }

      const result: RewriteResult = await res.json();
      const finalResult: RewriteResult = {
        ...result,
        projectBrief: result.projectBrief || currentBrief || undefined,
      };
      setRewriteResult(finalResult);
      setRewriteHistory((prev) => [finalResult, ...prev.slice(0, 19)]);
      setFeedbackItems([]);
    } finally {
      endWritingOperation();
    }
  };

  const applyQuickRefine = async (instruction: string) => {
    if (!rewriteResult?.rewrittenText) return;

    if (!beginWritingOperation()) return;
    try {
      const currentBrief = projectBrief;
      const res = await fetch('/api/quick-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText: rewriteResult.rewrittenText,
          originalText: rewriteResult.originalText,
          sourceDraft: rewriteResult.originalText,
          projectBrief: currentBrief || undefined,
          instruction,
          profile: activeProfile,
          samples: samples.filter((s) => s.enabled).map(({ id, title, content, enabled }) => ({ id, title, content, enabled })),
          preservationLocks,
          preservationSettings,
          customInstructions: customDirectives,
          toneAdjustments,
          toneEnabled: Boolean(toneAdjustments.enabled),
          domainExpertise,
          model: modelSettings.writingModel || 'gemini-3.8-flash',
          reasoningLevel: modelSettings.writingReasoningLevel || 'auto',
          analysisModel: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          analysisReasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to refine draft');
      }

      const {
        refinedText,
        tweakSummary,
        review,
        modelUsed,
        durationMs,
        writingModelUsed,
        writingDurationMs,
        analysisModelUsed,
        preservationSettings: returnedPreservation,
      } = await res.json();
      if (!refinedText || typeof refinedText !== 'string') {
        throw new Error('The refinement returned no prose.');
      }
      const wordCountRewritten = refinedText.trim().split(/\s+/).filter(Boolean).length;

      const updatedResult: RewriteResult = {
        ...rewriteResult,
        rewrittenText: refinedText,
        wordCountRewritten,
        changesExplanation: `${tweakSummary}\n\n${rewriteResult.changesExplanation}`,
        review,
        projectBrief: currentBrief || undefined,
        modelUsed: modelUsed || writingModelUsed || modelSettings.writingModel || 'gemini-3.8-flash',
        durationMs: durationMs ?? rewriteResult.durationMs,
        writingModelUsed: writingModelUsed || modelUsed || modelSettings.writingModel || 'gemini-3.8-flash',
        writingDurationMs: writingDurationMs ?? rewriteResult.writingDurationMs,
        analysisModelUsed: analysisModelUsed || modelSettings.analysisModel || 'gemini-3.1-pro-preview',
        preservationSettings: returnedPreservation || preservationSettings,
        stylisticAudit: undefined,
        styleSimilarity: undefined,
        historicalAssessment: undefined,
      };

      setRewriteResult(updatedResult);
      setRewriteHistory((prev) => [updatedResult, ...prev.slice(0, 19)]);
    } finally {
      endWritingOperation();
    }
  };

  const editSelection = async (
    selectedText: string,
    instruction: string,
    tag?: FeedbackTag,
    alsoSaveToProfile = false,
    selectionRange?: SelectionRange
  ): Promise<{ replacementText: string; explanation: string }> => {
    if (!rewriteResult?.rewrittenText || !selectedText.trim()) {
      throw new Error('No active rewrite text or selection to edit');
    }

    const currentText = rewriteResult.rewrittenText;
    const exactSelectedText = selectionRange
      ? currentText.slice(selectionRange.start, selectionRange.end)
      : selectedText;
    if (selectionRange && exactSelectedText !== selectedText) {
      throw new Error('The selected passage changed. Select it again.');
    }
    const occurrences: number[] = [];
    let nextIndex = currentText.indexOf(selectedText);
    while (nextIndex >= 0) {
      occurrences.push(nextIndex);
      nextIndex = currentText.indexOf(selectedText, nextIndex + Math.max(selectedText.length, 1));
    }
    const startIndex = selectionRange?.start ?? (occurrences.length === 1 ? occurrences[0] : -1);
    if (!selectionRange && occurrences.length > 1) {
      throw new Error('This passage appears more than once. Select the exact occurrence again.');
    }

    // Prepare surrounding context (up to 250 chars before and after for continuity)
    const contextStart = Math.max(0, (startIndex >= 0 ? startIndex : 0) - 250);
    const contextEnd = Math.min(
      currentText.length,
      (startIndex >= 0 ? startIndex + exactSelectedText.length : exactSelectedText.length) + 250
    );
    const surroundingContext = currentText.slice(contextStart, contextEnd);

    if (!beginWritingOperation()) {
      throw new Error('Another writing operation is already in progress.');
    }
    try {
      const currentBrief = projectBrief;
      const res = await fetch('/api/edit-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedText: exactSelectedText,
        selectionRange: startIndex >= 0 ? { start: startIndex, end: startIndex + exactSelectedText.length } : undefined,
        currentText,
        originalText: rewriteResult.originalText,
        sourceDraft: rewriteResult.originalText,
        projectBrief: currentBrief || undefined,
        surroundingContext,
        instruction,
        tag,
        profile: activeProfile,
        samples: samples.filter((s) => s.enabled).map(({ id, title, content, enabled }) => ({ id, title, content, enabled })),
        preservationLocks,
        preservationSettings,
        customInstructions: customDirectives,
        toneAdjustments,
        toneEnabled: Boolean(toneAdjustments.enabled),
        domainExpertise,
        model: modelSettings.writingModel || 'gemini-3.8-flash',
        reasoningLevel: modelSettings.writingReasoningLevel || 'auto',
        analysisModel: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
        analysisReasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
      }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to edit selection');
      }

      const {
        replacementText,
        explanation,
        finalText,
        review,
        modelUsed,
        durationMs,
        writingModelUsed,
        writingDurationMs,
        analysisModelUsed,
        preservationSettings: returnedPreservation,
      } = await res.json();

      // Replace selectedText in currentText
      const newFullText = typeof finalText === 'string'
        ? finalText
        : currentText.slice(0, startIndex) + replacementText + currentText.slice(startIndex + exactSelectedText.length);

      const wordCountRewritten = newFullText.trim().split(/\s+/).filter(Boolean).length;
      const updatedResult: RewriteResult = {
        ...rewriteResult,
        rewrittenText: newFullText,
        wordCountRewritten,
        projectBrief: currentBrief || undefined,
        modelUsed: modelUsed || writingModelUsed || modelSettings.writingModel || 'gemini-3.8-flash',
        durationMs: durationMs ?? rewriteResult.durationMs,
        changesExplanation: `[Line Edit: ${explanation}]\n\n${rewriteResult.changesExplanation}`,
        review,
        writingModelUsed: writingModelUsed || modelUsed || modelSettings.writingModel || 'gemini-3.8-flash',
        writingDurationMs: writingDurationMs ?? rewriteResult.writingDurationMs,
        analysisModelUsed: analysisModelUsed || modelSettings.analysisModel || 'gemini-3.1-pro-preview',
        preservationSettings: returnedPreservation || preservationSettings,
        stylisticAudit: undefined,
        styleSimilarity: undefined,
        historicalAssessment: undefined,
      };

      setRewriteResult(updatedResult);
      setRewriteHistory((prev) => [updatedResult, ...prev.slice(0, 19)]);

      if (alsoSaveToProfile) {
        addFeedbackItem({
          selectedText,
          tag: tag || 'not_my_voice',
          label: tag || 'Line Edit',
          note: instruction || `Replaced with: "${replacementText.slice(0, 80)}"`,
        });
      }

      return { replacementText, explanation };
    } finally {
      endWritingOperation();
    }
  };

  const loadSampleDraft = () => {
    updateDraftText(SAMPLE_DRAFT_TO_REWRITE);
  };

  const resetAllData = () => {
    setSamples(DEFAULT_SAMPLES);
    setActiveProfile(DEFAULT_PROFILE);
    setToneAdjustments(DEFAULT_TONE_ADJUSTMENTS);
    setModelSettings(DEFAULT_MODEL_SETTINGS);
    setDraftText('');
    draftUploadRef.current = null;
    setIsUploadingDraft(false);
    setDraftUploadError(null);
    setUseDraftAndBrief(true);
    briefUploadRef.current = null;
    setIsUploadingBrief(false);
    setBriefUploadError(null);
    setProjectBrief('');
    setRewriteResult(null);
    setRewriteHistory([]);
    setFeedbackItems([]);
    setActiveSampleId('sample-1');
  };

  return (
    <WritingAssistantContext.Provider
      value={{
        samples,
        activeProfile,
        activeTab,
        setActiveTab,
        draftText,
        setDraftText: updateDraftText,
        isUploadingDraft,
        draftUploadError,
        uploadDraft,
        useDraftAndBrief,
        setUseDraftAndBrief,
        projectBrief,
        setProjectBrief: updateProjectBrief,
        isUploadingBrief,
        briefUploadError,
        uploadProjectBrief,
        rewriteIntensity,
        setRewriteIntensity,
        preservationLocks,
        setPreservationLocks: handleSetPreservationLocks,
        preservationSettings,
        setPreservationSettings,
        updatePreservationSettings,
        customDirectives,
        setCustomDirectives,
        isRewriting,
        rewriteResult,
        setRewriteResult,
        rewriteHistory,
        isSynthesizingProfile,
        activeSampleId,
        setActiveSampleId,
        modelSettings,
        setModelSettings,
        updateWritingModel,
        updateWritingReasoningLevel,
        updateAnalysisModel,
        updateAnalysisReasoningLevel,
        updateModel,
        updateReasoningLevel,
        toneAdjustments,
        setToneAdjustments,
        resetToneAdjustments,
        domainExpertise,
        setDomainExpertise,
        updateDomainExpertise,
        feedbackItems,
        addFeedbackItem,
        removeFeedbackItem,
        clearFeedbackItems,
        isLearningFeedback,
        learnFromFeedback,
        addSample,
        analyzeSample,
        toggleSample,
        deleteSample,
        restoreDefaultSamples,
        synthesizeProfileFromActiveSamples,
        updateActiveProfile,
        performRewrite,
        applyQuickRefine,
        editSelection,
        loadSampleDraft,
        resetAllData,
      }}
    >
      {children}
    </WritingAssistantContext.Provider>
  );
};

export function useWritingAssistant(): WritingAssistantContextType {
  const ctx = useContext(WritingAssistantContext);
  if (!ctx) {
    throw new Error('useWritingAssistant must be used within WritingAssistantProvider');
  }
  return ctx;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '../types';
import { DEFAULT_SAMPLES, DEFAULT_PROFILE, SAMPLE_DRAFT_TO_REWRITE } from '../data/defaultSamples';

export type NavigationTab = 'samples' | 'profile' | 'domain' | 'studio';

interface WritingAssistantContextType {
  samples: WritingSample[];
  activeProfile: StyleProfile;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  draftText: string;
  setDraftText: (text: string) => void;
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
  updateModel: (model: GeminiModelChoice) => void;
  updateReasoningLevel: (level: ReasoningLevelChoice) => void;

  // Tone and Voice Sliders
  toneAdjustments: ToneAdjustments;
  setToneAdjustments: React.Dispatch<React.SetStateAction<ToneAdjustments>>;
  resetToneAdjustments: () => void;

  // Domain Expertise
  domainExpertise: DomainExpertise;
  setDomainExpertise: React.Dispatch<React.SetStateAction<DomainExpertise>>;
  updateDomainExpertise: (expertise: DomainExpertise) => void;

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
};

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  model: 'gemini-3.8-flash',
  reasoningLevel: 'auto',
};

const WritingAssistantContext = createContext<WritingAssistantContextType | undefined>(undefined);

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
        } else if (parsed.domainExpertise && (!parsed.domainExpertise.topics || parsed.domainExpertise.topics.length === 0)) {
          parsed.domainExpertise.topics = DEFAULT_PROFILE.domainExpertise?.topics;
          parsed.domainExpertise.disciplines = DEFAULT_PROFILE.domainExpertise?.disciplines || ['UX Copywriting', 'Content Design'];
          parsed.domainExpertise.field = DEFAULT_PROFILE.domainExpertise?.field || parsed.domainExpertise.field;
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
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read saved history from storage', e);
    }
    return [];
  });

  const [toneAdjustments, setToneAdjustments] = useState<ToneAdjustments>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TONE);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read saved tone adjustments', e);
    }
    return DEFAULT_TONE_ADJUSTMENTS;
  });

  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MODEL);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read saved model settings', e);
    }
    return DEFAULT_MODEL_SETTINGS;
  });

  const updateModel = (model: GeminiModelChoice) => {
    setModelSettings((prev) => ({ ...prev, model }));
  };

  const updateReasoningLevel = (reasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, reasoningLevel }));
  };

  const [domainExpertise, setDomainExpertise] = useState<DomainExpertise>(
    () => activeProfile.domainExpertise || DEFAULT_PROFILE.domainExpertise!
  );

  const [activeTab, setActiveTab] = useState<NavigationTab>('studio');
  const [draftText, setDraftText] = useState<string>(SAMPLE_DRAFT_TO_REWRITE);
  const [rewriteIntensity, setRewriteIntensity] = useState<RewriteIntensity>('faithful');

  const [preservationSettings, setPreservationSettings] = useState<PreservationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRESERVATION);
      if (saved) return JSON.parse(saved);
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
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [isSynthesizingProfile, setIsSynthesizingProfile] = useState<boolean>(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>('sample-1');

  // Feedback state
  const [feedbackItems, setFeedbackItems] = useState<RewriteFeedbackItem[]>([]);
  const [isLearningFeedback, setIsLearningFeedback] = useState<boolean>(false);

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

  // Keep local domain expertise aligned when activeProfile changes externally
  useEffect(() => {
    if (activeProfile.domainExpertise) {
      setDomainExpertise(activeProfile.domainExpertise);
    }
  }, [activeProfile.id]);

  const resetToneAdjustments = () => {
    setToneAdjustments({
      formality: activeProfile.metrics?.formality || 65,
      enthusiasm: 50,
      conciseness: 50,
    });
  };

  const updateDomainExpertise = (newExpertise: DomainExpertise) => {
    setDomainExpertise(newExpertise);
    setActiveProfile((prev) => ({
      ...prev,
      domainExpertise: newExpertise,
      updatedAt: new Date().toISOString(),
    }));
  };

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
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update profile from feedback');
      }

      const data: LearnFromFeedbackResponse = await res.json();
      setActiveProfile(data.updatedProfile);
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
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
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
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
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
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Profile synthesis failed');
      }

      const newProfile: StyleProfile = await res.json();
      setActiveProfile(newProfile);
      if (newProfile.domainExpertise) {
        setDomainExpertise(newProfile.domainExpertise);
      }
    } finally {
      setIsSynthesizingProfile(false);
    }
  };

  const updateActiveProfile = (profile: StyleProfile) => {
    setActiveProfile(profile);
    if (profile.domainExpertise) {
      setDomainExpertise(profile.domainExpertise);
    }
  };

  const performRewrite = async () => {
    if (!draftText || draftText.trim().length < 10) {
      throw new Error('Please enter draft text to rewrite (minimum 10 characters).');
    }

    setIsRewriting(true);
    try {
      // Extract authentic excerpts from active samples to serve as few-shot exemplars
      const activeSamples = samples.filter((s) => s.enabled);
      const exemplars = activeSamples.slice(0, 3).map((s) => {
        let excerpt = '';
        if (s.analysis?.notableExcerpts && s.analysis.notableExcerpts.length > 0) {
          excerpt = s.analysis.notableExcerpts.map((ne) => `"${ne.quote}" - ${ne.commentary}`).join('\n');
        }
        if (!excerpt || excerpt.length < 50) {
          excerpt = (s.content || '').trim().slice(0, 1200);
        }
        return {
          title: s.title,
          excerpt,
        };
      }).filter((e) => e.excerpt.length > 0);

      const res = await fetch('/api/rewrite-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draftText,
          profile: activeProfile,
          intensity: rewriteIntensity,
          preservationLocks,
          preservationSettings,
          customInstructions: customDirectives,
          toneAdjustments,
          domainExpertise,
          exemplars,
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to rewrite draft');
      }

      const result: RewriteResult = await res.json();
      setRewriteResult(result);
      setRewriteHistory((prev) => [result, ...prev.slice(0, 19)]);
      setFeedbackItems([]);
    } finally {
      setIsRewriting(false);
    }
  };

  const applyQuickRefine = async (instruction: string) => {
    if (!rewriteResult?.rewrittenText) return;

    setIsRewriting(true);
    try {
      const res = await fetch('/api/quick-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText: rewriteResult.rewrittenText,
          instruction,
          profile: activeProfile,
          model: modelSettings.model,
          reasoningLevel: modelSettings.reasoningLevel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to refine draft');
      }

      const { refinedText, tweakSummary } = await res.json();
      const wordCountRewritten = refinedText.trim().split(/\s+/).filter(Boolean).length;

      const updatedResult: RewriteResult = {
        ...rewriteResult,
        rewrittenText: refinedText,
        wordCountRewritten,
        changesExplanation: `${tweakSummary}\n\n${rewriteResult.changesExplanation}`,
      };

      setRewriteResult(updatedResult);
      setRewriteHistory((prev) => [updatedResult, ...prev.slice(0, 19)]);
    } finally {
      setIsRewriting(false);
    }
  };

  const loadSampleDraft = () => {
    setDraftText(SAMPLE_DRAFT_TO_REWRITE);
  };

  const resetAllData = () => {
    setSamples(DEFAULT_SAMPLES);
    setActiveProfile(DEFAULT_PROFILE);
    if (DEFAULT_PROFILE.domainExpertise) {
      setDomainExpertise(DEFAULT_PROFILE.domainExpertise);
    }
    setToneAdjustments(DEFAULT_TONE_ADJUSTMENTS);
    setModelSettings(DEFAULT_MODEL_SETTINGS);
    setDraftText(SAMPLE_DRAFT_TO_REWRITE);
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
        setDraftText,
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

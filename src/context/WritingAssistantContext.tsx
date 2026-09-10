import { isModelChoice } from '../modelChoice';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  WritingSample,
  StyleProfile,
  RewriteResult,
  RewriteIntensity,
  ToneAdjustments,
  DomainExpertise,
  RewriteFeedbackItem,
  ModelChoice,
  ReasoningLevelChoice,
  ModelSettings,
  PreservationSettings,
  HeadingTreatment,
  FeedbackTag,
  SelectionRange,
  EditorialPlan,
  EditorialPlanState,
} from '../types';
import { DEFAULT_SAMPLES, DEFAULT_PROFILE, SAMPLE_DRAFT_TO_REWRITE } from '../data/defaultSamples';
import { normalizeDomainExpertise, normalizePreservationSettings, validateProjectBrief, validateReaderPurpose } from '../writingPipeline';
import { normalizeRewriteHistory, retainRewriteVersions, createVersionId } from '../utils/rewriteHistory';
import { unappliedFeedback, persistFeedbackProfile, persistFeedbackRetirement, feedbackForHistory } from '../utils/voiceFeedback';
import { readStudioWorkspace, saveStudioWorkspace, StudioWorkspace } from '../utils/studioWorkspace';
import { validateApprovedPlan, validateEditorialPlan, validatePlanSources } from '../editorialPlan';

export type NavigationTab = 'samples' | 'profile' | 'draft-brief' | 'domain' | 'studio';

interface WritingAssistantContextType {
  editorialPlan?: EditorialPlanState;
  isPlanning: boolean;
  generateEditorialPlan: () => Promise<void>;
  editEditorialPlan: (plan: EditorialPlan) => void;
  approveEditorialPlan: () => EditorialPlanState;
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
  readerPurpose: string;
  editorialPreferences: string;
  setEditorialPreferences: (preferences: string) => void;
  setReaderPurpose: (readerPurpose: string) => void;
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
  rewriteResultOrigin: 'saved' | 'generated';
  usingSavedVersionContext: boolean;
  setRewriteResult: (result: RewriteResult | null) => void;
  rewriteHistory: RewriteResult[];
  historyStorageError: string | null;
  workspaceSaveError: string | null;
  downloadWorkingCopy: () => void;
  restoreRewriteVersion: (id: string) => void;
  isSynthesizingProfile: boolean;
  activeSampleId: string | null;
  setActiveSampleId: (id: string | null) => void;

  // Model and Reasoning Settings
  modelSettingsRequest: { role: 'writing' | 'analysis'; sequence: number };
  openModelSettings: (role: 'writing' | 'analysis') => void;
  modelSettings: ModelSettings;
  setModelSettings: React.Dispatch<React.SetStateAction<ModelSettings>>;
  updateWritingModel: (model: ModelChoice) => void;
  updateWritingReasoningLevel: (level: ReasoningLevelChoice) => void;
  updateAnalysisModel: (model: ModelChoice) => void;
  updateAnalysisReasoningLevel: (level: ReasoningLevelChoice) => void;
  updateModel: (model: ModelChoice) => void;
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
  saveFeedbackItem: (item: Omit<RewriteFeedbackItem, 'id' | 'createdAt' | 'saveStatus'> | RewriteFeedbackItem, afterEdit?: boolean) => Promise<void>;
  feedbackSaveNotice: { state: 'saving' | 'saved' | 'failed' | 'retired'; message: string; item?: RewriteFeedbackItem; retryRetirement?: boolean } | null;
  dismissFeedbackSaveNotice: () => void;
  retireEarlierFeedback: () => void;
  isLearningFeedback: boolean;

  // Actions
  addSample: (sample: Omit<WritingSample, 'id' | 'createdAt' | 'enabled'>) => Promise<WritingSample>;
  analyzeSample: (sampleId: string) => Promise<void>;
  cancelSampleAnalysis: (sampleId: string) => void;
  toggleSample: (sampleId: string) => void;
  deleteSample: (sampleId: string) => void;
  restoreDefaultSamples: () => void;
  synthesizeProfileFromActiveSamples: () => Promise<void>;
  updateActiveProfile: (profile: StyleProfile) => void;
  performRewrite: (approvedPlan?: EditorialPlanState) => Promise<void>;
  applyQuickRefine: (instruction: string) => Promise<void>;
  editSelection: (
    selectedText: string,
    instruction: string,
    tag?: FeedbackTag,
    selectionRange?: SelectionRange
  ) => Promise<{ replacementText: string; explanation: string }>;
  loadSampleDraft: () => void;
  resetPresets: () => void;
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
      if (saved) return JSON.parse(saved).map((sample: WritingSample) => ({
        ...sample,
        analyzing: false,
        ...(sample.analyzing ? { analysisError: 'Analysis was interrupted. You can try again.' } : {}),
      }));
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

  const [initialHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      return { entries: saved ? normalizeRewriteHistory(JSON.parse(saved)) : [], error: null };
    } catch (e) {
      console.warn('Could not read saved history from storage', e);
      return { entries: [], error: 'Saved version history could not be read. It has not been overwritten. New versions are available only in this session; download drafts you want to keep.' };
    }
  });
  const [rewriteHistory, setRewriteHistory] = useState<RewriteResult[]>(initialHistory.entries);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(initialHistory.error);
  const [historyStorageError, setHistoryStorageError] = useState<string | null>(initialHistory.error);

  const [initialWorkspace] = useState(() => readStudioWorkspace({ getItem: (key) => localStorage.getItem(key) }));
  const [workspaceSaveError, setWorkspaceSaveError] = useState<string | null>(initialWorkspace.error);
  const initialResult = initialWorkspace.found
    ? initialWorkspace.workspace.rewriteResult
    : initialHistory.entries[0] || null;

  const [toneAdjustments, setToneAdjustments] = useState<ToneAdjustments>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TONE);
      if (saved) return { ...DEFAULT_TONE_ADJUSTMENTS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Could not read saved tone adjustments', e);
    }
    return DEFAULT_TONE_ADJUSTMENTS;
  });

  const [modelSettingsRequest, setModelSettingsRequest] = useState<{ role: 'writing' | 'analysis'; sequence: number }>({ role: 'writing', sequence: 0 });
  const openModelSettings = (role: 'writing' | 'analysis') => setModelSettingsRequest((current) => ({ role, sequence: current.sequence + 1 }));
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MODEL);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          writingModel: isModelChoice(parsed.writingModel || parsed.model) ? (parsed.writingModel || parsed.model) : 'gemini-3.8-flash',
          writingReasoningLevel: parsed.writingReasoningLevel || parsed.reasoningLevel || 'auto',
          analysisModel: isModelChoice(parsed.analysisModel) ? parsed.analysisModel : 'gemini-3.1-pro-preview',
          analysisReasoningLevel: parsed.analysisReasoningLevel || 'auto',
          model: isModelChoice(parsed.writingModel || parsed.model) ? (parsed.writingModel || parsed.model) : 'gemini-3.8-flash',
          reasoningLevel: parsed.writingReasoningLevel || parsed.reasoningLevel || 'auto',
        };
      }
    } catch (e) {
      console.warn('Could not read saved model settings', e);
    }
    return DEFAULT_MODEL_SETTINGS;
  });

  const updateWritingModel = (writingModel: ModelChoice) => {
    setModelSettings((prev) => ({ ...prev, writingModel, model: writingModel }));
  };

  const updateWritingReasoningLevel = (writingReasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, writingReasoningLevel, reasoningLevel: writingReasoningLevel }));
  };

  const updateAnalysisModel = (analysisModel: ModelChoice) => {
    setModelSettings((prev) => ({ ...prev, analysisModel }));
  };

  const updateAnalysisReasoningLevel = (analysisReasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, analysisReasoningLevel }));
  };

  const updateModel = (model: ModelChoice) => {
    setModelSettings((prev) => ({ ...prev, model, writingModel: model }));
  };

  const updateReasoningLevel = (reasoningLevel: ReasoningLevelChoice) => {
    setModelSettings((prev) => ({ ...prev, reasoningLevel, writingReasoningLevel: reasoningLevel }));
  };

  const domainExpertise = activeProfile.domainExpertise || DEFAULT_PROFILE.domainExpertise!;

  const [activeTab, setActiveTab] = useState<NavigationTab>('samples');
  const [draftText, setDraftText] = useState<string>(initialWorkspace.workspace.draftText);
  const [isUploadingDraft, setIsUploadingDraft] = useState(false);
  const [draftUploadError, setDraftUploadError] = useState<string | null>(null);
  const draftUploadRef = useRef<symbol | null>(null);
  const [useDraftAndBrief, setUseDraftAndBrief] = useState(true);
  const [projectBrief, setProjectBrief] = useState<string>(initialWorkspace.workspace.projectBrief);
  const [readerPurpose, setReaderPurpose] = useState<string>(initialWorkspace.workspace.readerPurpose);
  const [editorialPreferences, setEditorialPreferences] = useState<string>(initialWorkspace.workspace.editorialPreferences);
  const [isUploadingBrief, setIsUploadingBrief] = useState(false);
  const [briefUploadError, setBriefUploadError] = useState<string | null>(null);
  const briefUploadRef = useRef<symbol | null>(null);
  const [rewriteIntensity, setRewriteIntensity] = useState<RewriteIntensity>(initialWorkspace.workspace.rewriteIntensity);

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

  const [customDirectives, setCustomDirectives] = useState<string>(initialWorkspace.workspace.customDirectives);
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [editorialPlan, setEditorialPlan] = useState<EditorialPlanState | undefined>(initialWorkspace.workspace.editorialPlan);
  const [isPlanning, setIsPlanning] = useState(false);
  const writingOperationLock = useRef(false);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(initialResult);
  const [rewriteResultOrigin, setRewriteResultOrigin] = useState<'saved' | 'generated'>('saved');
  const [usingSavedVersionContext, setUsingSavedVersionContext] = useState(initialWorkspace.found ? initialWorkspace.workspace.usingSavedVersionContext : Boolean(initialResult));
  const [isSynthesizingProfile, setIsSynthesizingProfile] = useState<boolean>(false);
  const [activeSampleId, setActiveSampleId] = useState<string | null>('sample-1');

  // Feedback state
  const [feedbackItems, setFeedbackItems] = useState<RewriteFeedbackItem[]>(unappliedFeedback(initialWorkspace.found ? initialWorkspace.workspace.feedbackItems : initialResult?.feedbackItems || [], activeProfile));
  const [isLearningFeedback, setIsLearningFeedback] = useState<boolean>(false);
  const feedbackSaveLock = useRef(false);
  const profileRef = useRef(activeProfile);
  profileRef.current = activeProfile;
  const [feedbackSaveNotice, setFeedbackSaveNotice] = useState<WritingAssistantContextType['feedbackSaveNotice']>(null);

  const workingCopy: StudioWorkspace = {
    draftText, projectBrief, readerPurpose, editorialPreferences, customDirectives, rewriteIntensity, rewriteResult,
    usingSavedVersionContext, feedbackItems, editorialPlan,
  };

  useEffect(() => {
    if (initialWorkspace.error) return;
    setWorkspaceSaveError(saveStudioWorkspace({ setItem: (key, value) => localStorage.setItem(key, value) }, {
      draftText, projectBrief, readerPurpose, editorialPreferences, customDirectives, rewriteIntensity, rewriteResult,
      usingSavedVersionContext, feedbackItems, editorialPlan,
    }));
  }, [draftText, projectBrief, readerPurpose, editorialPreferences, customDirectives, rewriteIntensity, rewriteResult, usingSavedVersionContext, feedbackItems, editorialPlan, initialWorkspace.error]);

  useEffect(() => {
    if (!workspaceSaveError && !historyStorageError) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [workspaceSaveError, historyStorageError]);

  const downloadWorkingCopy = () => {
    // Include in-memory versions when history storage failed but the current snapshot saved.
    const blob = new Blob([JSON.stringify({ ...workingCopy, rewriteHistory }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personascript-working-copy.json';
    link.click();
    URL.revokeObjectURL(url);
  };

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

  const beginWritingOperation = (effectiveBrief: string, effectiveReaderPurpose: string) => {
    if (draftUploadRef.current || briefUploadRef.current) throw new Error('Wait for draft and brief uploads to finish.');
    validateProjectBrief(effectiveBrief);
    validateReaderPurpose(effectiveReaderPurpose);
    if (feedbackSaveLock.current) throw new Error('Wait for your voice note to finish saving.');
    if (writingOperationLock.current) throw new Error('Wait for the current planning or writing operation to finish.');
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
    if (historyLoadError) return;
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(rewriteHistory));
      setHistoryStorageError(null);
    } catch (e) {
      console.error('Error saving history to storage', e);
      setHistoryStorageError('Version history could not be saved in this browser. Keep this page open and download drafts you want to keep before refreshing.');
    }
  }, [rewriteHistory, historyLoadError]);

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

  const retireEarlierFeedback = () => {
    if (feedbackSaveLock.current) return;
    const earlier = feedbackItems.filter((item) => !item.saveStatus);
    if (!earlier.length || !rewriteResult) return;
    try {
      // Keep the original notes with their version before clearing the old queue.
      const archivedResult = { ...rewriteResult, feedbackItems };
      const history = retainRewriteVersions(rewriteHistory, archivedResult);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
      const next = persistFeedbackRetirement(profileRef.current, earlier.map((item) => item.id),
        (value) => localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(value)));
      profileRef.current = next;
      setActiveProfile(next);
      setRewriteHistory(history);
      setRewriteResult(archivedResult);
      setFeedbackItems((prev) => unappliedFeedback(prev, next));
      setFeedbackSaveNotice({ state: 'retired', message: 'Earlier notes cleared. Your voice profile is unchanged. No action needed.' });
    } catch {
      setFeedbackSaveNotice({ state: 'failed', message: 'Browser storage could not finish clearing the old notes. Your notes and voice profile are unchanged.', retryRetirement: true });
    }
  };

  // The old queue survived successful learning. Retire it without running learning again.
  useEffect(() => { retireEarlierFeedback(); }, []);

  const saveFeedbackItem: WritingAssistantContextType['saveFeedbackItem'] = async (input, afterEdit = false) => {
    if (feedbackSaveLock.current) return;
    if (!rewriteResult) throw new Error('No active rewrite result.');
    const profile = profileRef.current;
    const item: RewriteFeedbackItem = 'id' in input ? input : {
      ...input, id: `fb-${createVersionId()}`, createdAt: new Date().toISOString(), saveStatus: 'pending',
    };
    if (profile.appliedFeedbackIds?.includes(item.id)) {
      setFeedbackItems((prev) => unappliedFeedback(prev, profile));
      setFeedbackSaveNotice({ state: 'saved', message: 'Voice note already saved to your profile.' });
      return;
    }
    // Historical notes have no receipt: never replay them automatically.
    if ('id' in input && !input.saveStatus) throw new Error('This older note has no recorded save status.');
    feedbackSaveLock.current = true;
    setIsLearningFeedback(true);
    setFeedbackItems((prev) => [...prev.filter((entry) => entry.id !== item.id), { ...item, saveStatus: 'pending' }]);
    setFeedbackSaveNotice({ state: 'saving', message: 'Saving voice note to your profile…' });
    try {
      const res = await fetch('/api/learn-from-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackItems: [item], profile,
          rewrittenText: rewriteResult.rewrittenText,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update your voice profile.');
      if (profileRef.current !== profile) throw new Error('Your profile changed while saving. Retry to use the current profile.');
      const next = persistFeedbackProfile(data, profile, item.id, (value) => {
        try { localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(value)); }
        catch { throw new Error('Browser storage could not save your profile. Free space or restore storage access, then retry.'); }
      });
      profileRef.current = next;
      setActiveProfile(next);
      setFeedbackItems((prev) => unappliedFeedback(prev, next));
      setRewriteResult((prev) => prev ? { ...prev, feedbackItems: unappliedFeedback(prev.feedbackItems || [], { ...next, retiredFeedbackIds: [] }) } : prev);
      setRewriteHistory((prev) => prev.map((version) => ({ ...version, feedbackItems: unappliedFeedback(version.feedbackItems || [], { ...next, retiredFeedbackIds: [] }) })));
      setFeedbackSaveNotice({ state: 'saved', message: 'Voice note saved. Your profile is updated.' });
    } catch (error: any) {
      const failed: RewriteFeedbackItem = { ...item, saveStatus: 'failed' };
      setFeedbackItems((prev) => [...prev.filter((entry) => entry.id !== item.id), failed]);
      setFeedbackSaveNotice({ state: 'failed', message: (afterEdit ? 'Your draft edit is complete. ' : '') + (error.message || 'Voice note could not be saved.'), item: failed });
    } finally {
      feedbackSaveLock.current = false;
      setIsLearningFeedback(false);
    }
  };

  const sampleAnalysisRequests = useRef(new Map<string, AbortController>());
  useEffect(() => () => {
    for (const request of sampleAnalysisRequests.current.values()) request.abort();
    sampleAnalysisRequests.current.clear();
  }, []);

  const addSample = async (sampleData: Omit<WritingSample, 'id' | 'createdAt' | 'enabled'>): Promise<WritingSample> => {
    if (!sampleData.content.trim()) throw new Error('Please enter writing sample text.');
    const newSample: WritingSample = {
      ...sampleData,
      id: `sample-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, '0')).join('')}`,
      createdAt: new Date().toISOString(),
      enabled: true,
      analyzing: false,
    };
    setSamples((prev) => [newSample, ...prev]);
    setActiveSampleId(newSample.id);
    return newSample;
  };

  const cancelSampleAnalysis = (sampleId: string) => {
    sampleAnalysisRequests.current.get(sampleId)?.abort();
    sampleAnalysisRequests.current.delete(sampleId);
    setSamples((prev) => prev.map((sample) => sample.id === sampleId
      ? { ...sample, analyzing: false, analysisError: 'Analysis cancelled. Your sample is still available.' }
      : sample));
  };

  const analyzeSample = async (sampleId: string): Promise<void> => {
    const target = samples.find((sample) => sample.id === sampleId);
    if (!target || sampleAnalysisRequests.current.has(sampleId)) return;
    const controller = new AbortController();
    sampleAnalysisRequests.current.set(sampleId, controller);
    const timeout = setTimeout(() => controller.abort(new DOMException('Analysis timed out. Please try again.', 'TimeoutError')), 600_000);
    setSamples((prev) => prev.map((sample) => sample.id === sampleId
      ? { ...sample, analyzing: true, analysisError: undefined } : sample));
    try {
      const res = await fetch('/api/analyze-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          title: target.title,
          text: target.content,
          fileType: target.fileType,
          model: modelSettings.analysisModel || 'gemini-3.1-pro-preview',
          reasoningLevel: modelSettings.analysisReasoningLevel || 'auto',
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Analysis failed. Please try again.');
      }
      const analysis = await res.json();
      if (controller.signal.aborted || sampleAnalysisRequests.current.get(sampleId) !== controller) return;
      setSamples((prev) => prev.map((sample) => sample.id === sampleId
        ? { ...sample, analysis, analyzing: false, analysisError: undefined } : sample));
    } catch (error) {
      if (sampleAnalysisRequests.current.get(sampleId) !== controller) return;
      const message = controller.signal.aborted
        ? 'Analysis reached the 10-minute limit. Your sample is still available. Please try again.'
        : error instanceof Error ? error.message : 'Analysis failed. Please try again.';
      setSamples((prev) => prev.map((sample) => sample.id === sampleId
        ? { ...sample, analyzing: false, analysisError: message } : sample));
    } finally {
      clearTimeout(timeout);
      if (sampleAnalysisRequests.current.get(sampleId) === controller) sampleAnalysisRequests.current.delete(sampleId);
    }
  };

  const toggleSample = (sampleId: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const deleteSample = (sampleId: string) => {
    sampleAnalysisRequests.current.get(sampleId)?.abort();
    sampleAnalysisRequests.current.delete(sampleId);
    setSamples((prev) => {
      const remaining = prev.filter((s) => s.id !== sampleId);
      if (activeSampleId === sampleId) {
        setActiveSampleId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const restoreDefaultSamples = () => {
    for (const request of sampleAnalysisRequests.current.values()) request.abort();
    sampleAnalysisRequests.current.clear();
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

  const storeCompletedVersion = (result: RewriteResult) => {
    setRewriteHistory((prev) => retainRewriteVersions(
      prev, result, rewriteResult ? { ...rewriteResult, feedbackItems: feedbackForHistory(rewriteResult.feedbackItems || [], feedbackItems, profileRef.current) } : null,
    ));
    setRewriteResult(result);
    setRewriteResultOrigin('generated');
    setFeedbackItems(unappliedFeedback(result.feedbackItems || [], profileRef.current));
  };

  const restoreRewriteVersion = (id: string) => {
    if (writingOperationLock.current || feedbackSaveLock.current) return;
    const saved = rewriteHistory.find((entry) => entry.id === id);
    if (!saved) return;
    if (saved.id === rewriteResult?.id) { setRewriteResultOrigin('saved'); return; }
    if (rewriteResult) {
      const outgoing = { ...rewriteResult, feedbackItems: feedbackForHistory(rewriteResult.feedbackItems || [], feedbackItems, profileRef.current) };
      setRewriteHistory((prev) => prev.some((entry) => entry.id === outgoing.id)
        ? prev.map((entry) => entry.id === outgoing.id ? outgoing : entry)
        : retainRewriteVersions(prev, outgoing));
    }
    setRewriteResult(saved);
    setRewriteResultOrigin('saved');
    setFeedbackItems(unappliedFeedback(saved.feedbackItems || [], profileRef.current));
    setUsingSavedVersionContext(true);
  };

  const generateEditorialPlan = async () => {
    const sources = validatePlanSources(draftText, projectBrief, readerPurpose, editorialPreferences);
    if (draftUploadRef.current || briefUploadRef.current) throw new Error('Wait for draft and brief uploads to finish.');
    if (writingOperationLock.current || feedbackSaveLock.current) throw new Error('Wait for the current operation to finish before planning.');
    writingOperationLock.current = true;
    setIsPlanning(true);
    try {
      const res = await fetch('/api/plan-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sources, model: modelSettings.analysisModel, reasoningLevel: modelSettings.analysisReasoningLevel }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not propose editorial decisions.');
      const plan = validateEditorialPlan(result.plan, sources, { allowPendingConflictEvidence: true });
      setEditorialPlan({ plan, sources, approved: false, modelUsed: result.modelUsed });
    } finally {
      writingOperationLock.current = false;
      setIsPlanning(false);
    }
  };

  const editEditorialPlan = (plan: EditorialPlan) => {
    if (writingOperationLock.current) return;
    setEditorialPlan(current => current ? { ...current, plan, approved: false } : current);
  };

  const approveEditorialPlan = () => {
    if (!editorialPlan) throw new Error('Create an edit plan before rewriting.');
    if (writingOperationLock.current) throw new Error('Wait for the current operation to finish.');
    const sources = validatePlanSources(draftText, projectBrief, readerPurpose, editorialPreferences);
    const plan = validateEditorialPlan(editorialPlan.plan, sources);
    const approved = { ...editorialPlan, plan, sources, approved: true };
    setEditorialPlan(approved);
    return approved;
  };

  const performRewrite = async (approvedSnapshot?: EditorialPlanState) => {
    if (!draftText || draftText.trim().length < 10) {
      throw new Error('Please enter draft text to rewrite (minimum 10 characters).');
    }
    const currentPlan = approvedSnapshot || editorialPlan;
    if (!currentPlan) throw new Error('Create and approve an edit plan before rewriting.');
    const approvedPlan = validateApprovedPlan(currentPlan, { draft: draftText, projectBrief, readerPurpose, editorialPreferences });

    if (!beginWritingOperation(projectBrief, readerPurpose)) return;
    try {
      const activeSamples = samples.filter((s) => s.enabled);
      if (activeSamples.length === 0) {
        throw new Error('Enable at least one writing sample before rewriting.');
      }
      const corpus = activeSamples.map(({ id, title, content, enabled }) => ({ id, title, content, enabled }));
      const currentBrief = projectBrief;
      const currentReaderPurpose = readerPurpose;
      const currentEditorialPreferences = editorialPreferences;

      const res = await fetch('/api/rewrite-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draftText,
          projectBrief: currentBrief || undefined,
          readerPurpose: currentReaderPurpose || undefined,
          editorialPreferences: currentEditorialPreferences,
          editorialPlan: approvedPlan,
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
        id: createVersionId(),
        revision: { kind: 'rewrite' },
        modelSettings: { ...modelSettings },
        projectBrief: result.projectBrief || currentBrief || undefined,
        readerPurpose: result.readerPurpose !== undefined ? result.readerPurpose : currentReaderPurpose || undefined,
        editorialPreferences: result.editorialPreferences ?? currentEditorialPreferences,
      };
      storeCompletedVersion(finalResult);
      setUsingSavedVersionContext(false);
    } finally {
      endWritingOperation();
    }
  };

  const applyQuickRefine = async (instruction: string) => {
    if (!rewriteResult?.rewrittenText) return;

    const currentBrief = usingSavedVersionContext || rewriteResult.editorialPlan ? rewriteResult.projectBrief || '' : projectBrief;
    const currentReaderPurpose = usingSavedVersionContext || rewriteResult.editorialPlan ? rewriteResult.readerPurpose || '' : readerPurpose;
    const currentEditorialPreferences = rewriteResult.editorialPreferences ?? rewriteResult.editorialPlan?.sources.editorialPreferences ?? '';
    if (!beginWritingOperation(currentBrief, currentReaderPurpose)) return;
    try {
      const res = await fetch('/api/quick-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText: rewriteResult.rewrittenText,
          originalText: rewriteResult.originalText,
          sourceDraft: rewriteResult.originalText,
          projectBrief: currentBrief || undefined,
          readerPurpose: currentReaderPurpose || undefined,
          editorialPreferences: currentEditorialPreferences,
          editorialPlan: rewriteResult.editorialPlan,
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
        id: createVersionId(),
        parentId: rewriteResult.id,
        createdAt: new Date().toISOString(),
        revision: { kind: 'refine', instruction },
        modelSettings: { ...modelSettings },
        profileId: activeProfile.id,
        profileName: activeProfile.name,
        customInstructions: customDirectives,
        preservationLocks,
        toneAdjustments,
        domainExpertise,
        feedbackItems,
        rewrittenText: refinedText,
        wordCountRewritten,
        changesExplanation: `${tweakSummary}\n\n${rewriteResult.changesExplanation}`,
        review,
        projectBrief: currentBrief || undefined,
        readerPurpose: currentReaderPurpose || undefined,
          editorialPreferences: currentEditorialPreferences,
        editorialPlan: rewriteResult.editorialPlan,
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

      storeCompletedVersion(updatedResult);
    } finally {
      endWritingOperation();
    }
  };

  const editSelection = async (
    selectedText: string,
    instruction: string,
    tag?: FeedbackTag,
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

    const currentBrief = usingSavedVersionContext || rewriteResult.editorialPlan ? rewriteResult.projectBrief || '' : projectBrief;
    const currentReaderPurpose = usingSavedVersionContext || rewriteResult.editorialPlan ? rewriteResult.readerPurpose || '' : readerPurpose;
    const currentEditorialPreferences = rewriteResult.editorialPreferences ?? rewriteResult.editorialPlan?.sources.editorialPreferences ?? '';
    if (!beginWritingOperation(currentBrief, currentReaderPurpose)) {
      throw new Error('Another writing operation is already in progress.');
    }
    try {
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
        readerPurpose: currentReaderPurpose || undefined,
          editorialPreferences: currentEditorialPreferences,
        editorialPlan: rewriteResult.editorialPlan,
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
        id: createVersionId(),
        parentId: rewriteResult.id,
        createdAt: new Date().toISOString(),
        revision: { kind: 'selection', instruction: instruction || tag, selectionRange: startIndex >= 0 ? { start: startIndex, end: startIndex + exactSelectedText.length } : undefined },
        modelSettings: { ...modelSettings },
        profileId: activeProfile.id,
        profileName: activeProfile.name,
        customInstructions: customDirectives,
        preservationLocks,
        toneAdjustments,
        domainExpertise,
        feedbackItems,
        rewrittenText: newFullText,
        wordCountRewritten,
        projectBrief: currentBrief || undefined,
        readerPurpose: currentReaderPurpose || undefined,
          editorialPreferences: currentEditorialPreferences,
        editorialPlan: rewriteResult.editorialPlan,
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

      storeCompletedVersion(updatedResult);

      return { replacementText, explanation };
    } finally {
      endWritingOperation();
    }
  };

  const loadSampleDraft = () => {
    updateDraftText(SAMPLE_DRAFT_TO_REWRITE);
  };

  const resetPresets = () => {
    setSamples(DEFAULT_SAMPLES);
    setActiveProfile(DEFAULT_PROFILE);
    setToneAdjustments(DEFAULT_TONE_ADJUSTMENTS);
    setModelSettings(DEFAULT_MODEL_SETTINGS);
    setActiveSampleId('sample-1');
  };

  return (
    <WritingAssistantContext.Provider
      value={{
        editorialPlan, isPlanning, generateEditorialPlan, editEditorialPlan, approveEditorialPlan,
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
        readerPurpose,
        setReaderPurpose,
        editorialPreferences,
        setEditorialPreferences,
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
        rewriteResultOrigin,
        usingSavedVersionContext,
        setRewriteResult,
        rewriteHistory,
        historyStorageError,
        workspaceSaveError,
        downloadWorkingCopy,
        restoreRewriteVersion,
        isSynthesizingProfile,
        activeSampleId,
        setActiveSampleId,
        modelSettings,
        modelSettingsRequest,
        openModelSettings,
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
        saveFeedbackItem,
        feedbackSaveNotice,
        dismissFeedbackSaveNotice: () => setFeedbackSaveNotice(null),
        retireEarlierFeedback,
        isLearningFeedback,
        addSample,
        analyzeSample,
        cancelSampleAnalysis,
        toggleSample,
        deleteSample,
        restoreDefaultSamples,
        synthesizeProfileFromActiveSamples,
        updateActiveProfile,
        performRewrite,
        applyQuickRefine,
        editSelection,
        loadSampleDraft,
        resetPresets,
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

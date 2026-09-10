import { LearnFromFeedbackResponse, RewriteFeedbackItem, StyleProfile } from '../types';

export function unappliedFeedback(items: RewriteFeedbackItem[], profile: StyleProfile): RewriteFeedbackItem[] {
  const applied = new Set([...(profile.appliedFeedbackIds || []), ...(profile.retiredFeedbackIds || [])]);
  return items.filter((item) => !applied.has(item.id));
}

export function validateFeedbackUpdate(data: LearnFromFeedbackResponse): void {
  const updated = data?.updatedProfile;
  const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (!updated || typeof updated.name !== 'string' || typeof updated.voiceManifesto !== 'string'
    || !updated.metrics
    || ['formality', 'avgSentenceLength', 'sentenceLengthVariance', 'lexicalSophistication', 'warmth', 'directness', 'activeVoiceRatio', 'metaphorDensity'].some((key) => typeof updated.metrics[key] !== 'number' || !Number.isFinite(updated.metrics[key]))
    || !updated.synthesizedGuidelines
    || ['doList', 'dontList', 'signatureHabits', 'vocabularyPreferences'].some((key) => !strings(updated.synthesizedGuidelines[key]))
    || typeof updated.synthesizedGuidelines.pacingGuide !== 'string'
    || !strings(data.learningSummary) || !strings(data.rulesAdded) || !Array.isArray(data.metricAdjustments)
    || (updated.customDirectives !== undefined && typeof updated.customDirectives !== 'string')) {
    throw new Error('The profile update was incomplete. Your note has not been applied. Retry saving it.');
  }
}

/** Save the profile and receipt together before clearing any recoverable note. */
export function persistFeedbackProfile(
  data: LearnFromFeedbackResponse, profile: StyleProfile, itemId: string,
  persist: (profile: StyleProfile) => void,
): StyleProfile {
  validateFeedbackUpdate(data);
  const updated = data.updatedProfile;
  const next: StyleProfile = {
    ...profile, ...updated,
    id: profile.id, sampleIds: profile.sampleIds, domainExpertise: profile.domainExpertise,
    retiredFeedbackIds: profile.retiredFeedbackIds,
    appliedFeedbackIds: [...new Set([...(profile.appliedFeedbackIds || []), itemId])],
  };
  persist(next);
  return next;
}

/** Retiring old cards does not apply feedback or alter learned preferences. */
export function persistFeedbackRetirement(profile: StyleProfile, ids: string[], persist: (profile: StyleProfile) => void): StyleProfile {
  const next = { ...profile, retiredFeedbackIds: [...new Set([...(profile.retiredFeedbackIds || []), ...ids])] };
  persist(next);
  return next;
}

export function feedbackForHistory(previous: RewriteFeedbackItem[], current: RewriteFeedbackItem[], profile: StyleProfile): RewriteFeedbackItem[] {
  const retired = new Set(profile.retiredFeedbackIds || []);
  const records = new Map(previous.filter((item) => retired.has(item.id)).map((item) => [item.id, item]));
  current.forEach((item) => records.set(item.id, item));
  return [...records.values()];
}

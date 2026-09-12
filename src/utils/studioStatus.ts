export interface StudioStatusInput {
  hasDraft: boolean;
  isPlanning?: boolean;
  isRewriting?: boolean;
  isUploading?: boolean;
  rewriteError?: string | null;
  hasPlan: boolean;
  planStale?: boolean;
  staleReasons?: string[];
  planIssue?: string | null;
  planApproved?: boolean;
  hasRewrite?: boolean;
  pendingSuggestions?: number;
  isSavingVoice?: boolean;
}

export const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;

export interface StudioStatusResult {
  text: string;
  tone: 'status' | 'alert';
  action?: { label: string; targetTab: 'draft-brief' };
  detail?: string;
}

export function suggestionsStatus(input: StudioStatusInput): StudioStatusResult {
  // Priority 1: No draft
  if (!input.hasDraft) {
    return {
      text: 'Add your draft in Draft & Brief to begin.',
      tone: 'status',
      action: { label: 'Open Draft & Brief', targetTab: 'draft-brief' },
    };
  }

  // Priority 2: Planning in progress
  if (input.isPlanning) {
    return {
      text: 'Getting suggestions…',
      tone: 'status',
    };
  }

  // Priority 3: Rewriting in progress
  if (input.isRewriting) {
    return {
      text: 'Writing and reviewing…',
      tone: 'status',
    };
  }

  // Priority 4: Uploading draft or brief
  if (input.isUploading) {
    return {
      text: 'Waiting for your upload…',
      tone: 'status',
    };
  }

  // Priority 4.5: Saving voice preference
  if (input.isSavingVoice) {
    return {
      text: 'Saving your voice preference…',
      tone: 'status',
    };
  }

  // Priority 5: Error occurred
  if (input.rewriteError) {
    return {
      text: 'Could not finish. Your current work is unchanged.',
      tone: 'alert',
      detail: input.rewriteError,
    };
  }

  // Priority 6: No plan yet
  if (!input.hasPlan) {
    return {
      text: 'Get suggestions above first. The rewrite follows the ones you accept.',
      tone: 'status',
    };
  }

  // Priority 7: Plan is stale
  if (input.planStale) {
    const reasons = input.staleReasons || [];
    if (reasons.length > 0) {
      return {
        text: `Your ${joinList(reasons)} changed after these suggestions were prepared. Get suggestions again before rewriting.`,
        tone: 'status',
      };
    }
    return {
      text: 'These suggestions were made with an older version of the app. Get suggestions again before rewriting.',
      tone: 'status',
    };
  }

  // Priority 8: Plan has an issue/readiness blocker
  if (input.planIssue) {
    return {
      text: 'These suggestions no longer match your draft. Get suggestions again before rewriting.',
      tone: 'status',
      detail: input.planIssue,
    };
  }

  // Priority 9: Plan approved and rewrite exists. Nothing needs saying: the
  // provenance line already records that the last rewrite followed them.
  if (input.planApproved && input.hasRewrite) {
    return {
      text: '',
      tone: 'status',
    };
  }

  // Priority 10: Unanswered suggestions pending
  const pending = input.pendingSuggestions ?? 0;
  if (pending > 0) {
    return {
      text: pending === 1
        ? '1 unanswered suggestion will be accepted when you rewrite.'
        : `${pending} unanswered suggestions will be accepted when you rewrite.`,
      tone: 'status',
    };
  }

  // Priority 11: Otherwise ready
  return {
    text: 'Ready to rewrite.',
    tone: 'status',
  };
}

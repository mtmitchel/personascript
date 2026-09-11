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
}

export interface StudioStatusResult {
  text: string;
  tone: 'status' | 'alert';
  action?: { label: string; targetTab: 'draft-brief' };
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
      text: 'Reading your draft and brief…',
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

  // Priority 5: Error occurred
  if (input.rewriteError) {
    return {
      text: input.rewriteError,
      tone: 'alert',
    };
  }

  // Priority 6: No plan yet
  if (!input.hasPlan) {
    return {
      text: 'Get suggestions first. The rewrite follows the suggestions you accept.',
      tone: 'status',
    };
  }

  // Priority 7: Plan is stale
  if (input.planStale) {
    const reasons = input.staleReasons || [];
    if (reasons.length > 0) {
      return {
        text: `Your ${reasons.join(', ')} changed after these suggestions were prepared. Get new suggestions before rewriting.`,
        tone: 'status',
      };
    }
    return {
      text: 'These suggestions are in an older format. Get new suggestions before rewriting.',
      tone: 'status',
    };
  }

  // Priority 8: Plan has an issue/readiness blocker
  if (input.planIssue) {
    return {
      text: input.planIssue,
      tone: 'status',
    };
  }

  // Priority 9: Plan approved and rewrite exists
  if (input.planApproved && input.hasRewrite) {
    return {
      text: 'The last rewrite followed these suggestions. Rewrite writes a new version from the original draft.',
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

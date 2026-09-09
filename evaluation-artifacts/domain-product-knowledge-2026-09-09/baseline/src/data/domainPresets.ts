import { DomainTopic, DomainExpertise } from '../types';

export interface DomainPreset {
  id: string;
  name: string;
  field: string;
  disciplines: string[];
  audienceContext: string;
  customNotes: string;
  topics: DomainTopic[];
}

export const UX_PORTFOLIO_PRESET: DomainPreset = {
  id: 'ux-portfolio-case-study',
  name: 'UX Copywriting & Content Design (with Monetization, AI Translation & AI Writing)',
  field: 'UX Copywriting & Content Design',
  disciplines: ['UX Copywriting', 'Content Design'],
  audienceContext: 'Design directors, VP of Product, design leads, hiring managers, and cross-functional product partners evaluating portfolio case studies.',
  customNotes: `Focus on tangible product impact: user comprehension, conversion uplift, cognitive load reduction, and cross-functional collaboration between design, product, and engineering. Weave in the technical nuances of monetization mechanics, AI translation/localization constraints, and human-in-the-loop AI writing assistance without resorting to empty corporate buzzwords.`,
  topics: [
    {
      id: 'topic-content-design',
      name: 'UX Copywriting & Content Design',
      category: 'discipline',
      description: 'Microcopy, design systems, user journeys, error recovery, and clear product information architecture.',
      enabled: true,
      keyTerminology: [
        'microcopy',
        'affordances',
        'design systems & content components',
        'information architecture',
        'progressive disclosure',
        'empty states & error recovery',
        'voice & tone matrix',
        'scannability & visual hierarchy',
        'accessibility (a11y) & reading grade level',
        'user journey mapping',
      ],
      conventions: [
        'Keep interface copy action-oriented, clear, and scannable',
        'Eliminate dead ends by providing clear next steps and error recovery paths',
        'Bridge visual UI design and user mental models using unambiguous, plain language',
        'Ensure microcopy adheres to design system tokens and component patterns',
      ],
    },
    {
      id: 'topic-monetization',
      name: 'Monetization & Conversion UX',
      category: 'intersecting',
      description: 'Paywalls, subscription tiers, conversion funnels, trial-to-paid transitions, and pricing clarity.',
      enabled: true,
      keyTerminology: [
        'paywalls & gating UX',
        'freemium friction & drop-off',
        'conversion funnels',
        'pricing page transparency',
        'value metric alignment',
        'subscription tiers (Annual vs Monthly)',
        'trial-to-paid conversion',
        'upgrade triggers & contextual nudges',
        'cancellation & retention flows',
        'LTV / CAC economics',
      ],
      conventions: [
        'Frame monetization around delivered user value rather than artificial barrier gates',
        'Explain pricing tiers and feature entitlements with radical clarity and zero hidden gotchas',
        'Avoid deceptive dark patterns in trial expirations, billing, or subscription cancellation',
        'Place contextual upgrade triggers at moments of high user accomplishment or genuine need',
      ],
    },
    {
      id: 'topic-ai-translation',
      name: 'AI Translation & Localization',
      category: 'intersecting',
      description: 'Internationalization (i18n), localization (l10n), transcreation, MT post-editing, and cultural adaptation.',
      enabled: true,
      keyTerminology: [
        'localization (l10n) & internationalization (i18n)',
        'transcreation',
        'machine translation post-editing (MTPE)',
        'locale string keys',
        'text expansion factor (+30% in German/French)',
        'cultural nuance & idiomatic adaptation',
        'pseudo-localization testing',
        'glossary constraints & terminology locking',
        'RTL (right-to-left) layout considerations',
      ],
      conventions: [
        'Account for character expansion in UI buttons, badges, and headers across different locales',
        'Avoid culture-specific idioms, slang, and metaphors that degrade in machine translation',
        'Maintain consistent terminology keys and glossary definitions across translated surfaces',
        'Design modular content blocks that preserve syntactic integrity when localized',
      ],
    },
    {
      id: 'topic-ai-writing-assistance',
      name: 'AI Writing Assistance',
      category: 'intersecting',
      description: 'Human-in-the-loop interfaces, inline completions, prompt scaffolding, model confidence, and user agency.',
      enabled: true,
      keyTerminology: [
        'human-in-the-loop (HITL)',
        'prompt scaffolding & affordances',
        'inline completions & ghost text',
        'suggestion density & cognitive load',
        'model steerability & voice preservation',
        'confidence thresholds & hallucination mitigation',
        'generative UI & progressive reveal',
        'user agency & overwrite control',
        'latency perception & streaming feedback',
      ],
      conventions: [
        'Ensure the human author always retains ultimate editorial agency and effortless veto power',
        'Keep AI suggestions unobtrusive, low-friction, and easy to accept, tweak, or dismiss',
        'Provide transparent feedback on what changed and why, maintaining the author\'s authentic style',
        'Calibrate suggestion frequency to avoid cognitive fatigue or breaking the user\'s flow state',
      ],
    },
  ],
};

export const SYSTEMS_ENGINEERING_PRESET: DomainPreset = {
  id: 'systems-engineering',
  name: 'Distributed Systems & Software Engineering',
  field: 'Software Engineering & Distributed Systems',
  disciplines: ['Distributed Systems', 'Software Engineering'],
  audienceContext: 'Senior engineers, product architects, and technology leaders who value intellectual honesty and technical precision.',
  customNotes: 'Balance rigorous engineering concepts with evocative, tactile craftsmanship.',
  topics: [
    {
      id: 'topic-core-distributed-systems',
      name: 'Distributed Systems Core',
      category: 'discipline',
      description: 'Consensus, latency, idempotency, failure domains, and operational observability.',
      enabled: true,
      keyTerminology: [
        'latency',
        'p99 / tail performance',
        'idempotency',
        'blast radius',
        'distributed consensus',
        'observability',
        'API contracts',
        'friction points',
      ],
      conventions: [
        'Distinguish core architectural mechanisms from superficial symptoms',
        'Quantify performance trade-offs rather than using qualitative hype',
        'Avoid vague corporate buzzwords; describe concrete system states',
        'Acknowledge failure modes and operational boundaries explicitly',
      ],
    },
  ],
};

export const DOMAIN_PRESETS: DomainPreset[] = [
  UX_PORTFOLIO_PRESET,
  SYSTEMS_ENGINEERING_PRESET,
];

// Helper to convert a DomainPreset to a DomainExpertise object
export function presetToDomainExpertise(preset: DomainPreset): DomainExpertise {
  const allTerms = Array.from(
    new Set(
      preset.topics
        .filter((t) => t.enabled)
        .flatMap((t) => t.keyTerminology)
    )
  );

  const allConventions = Array.from(
    new Set(
      preset.topics
        .filter((t) => t.enabled)
        .flatMap((t) => t.conventions)
    )
  );

  return {
    enabled: true,
    field: preset.field,
    disciplines: [...preset.disciplines],
    topics: preset.topics.map((t) => ({ ...t })),
    keyTerminology: allTerms,
    conventions: allConventions,
    audienceContext: preset.audienceContext,
    customNotes: preset.customNotes,
  };
}

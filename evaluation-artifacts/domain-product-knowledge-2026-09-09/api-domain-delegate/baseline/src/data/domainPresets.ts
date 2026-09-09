import { DomainTopic, DomainExpertise, ProductReference } from '../types';

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
  customNotes: 'Use domain knowledge to recognize thinking already demonstrated in the draft. Name or explain a concept when it makes the reasoning clearer, alongside the concrete decision or example. Keep the language accessible. Do not invent actions, intentions, evidence, or outcomes.',
  topics: [
    {
      id: 'topic-content-design',
      name: 'UX Copywriting & Content Design',
      category: 'discipline',
      description: 'How content helps people understand information, find what they need, and make decisions.',
      enabled: true,
      keyTerminology: [
        'information hierarchy',
        'user comprehension',
        'navigation & findability',
        'informed choice',
        'consistency & accessibility',
      ],
      conventions: [
        'Connect relevant concepts to the content decisions described in the draft.',
      ],
    },
    {
      id: 'topic-monetization',
      name: 'Monetization & Conversion UX',
      category: 'intersecting',
      description: 'How people understand product value and choose between free and paid access, including plans and billing frequency.',
      enabled: true,
      keyTerminology: [
        'product value',
        'free & paid access',
        'pricing clarity',
        'conversion',
        'retention',
      ],
      conventions: [
        'Explain commercial reasoning through the user needs and choices shown in the draft.',
      ],
    },
    {
      id: 'topic-ai-translation',
      name: 'AI Translation & Localization',
      category: 'intersecting',
      description: 'How meaning, terminology, and context carry across languages and localized experiences.',
      enabled: true,
      keyTerminology: [
        'meaning across languages',
        'terminology consistency',
        'cultural context',
        'localization',
        'translation quality',
      ],
      conventions: [
        'Use translation concepts where they help explain the work; distinguish product capabilities from localization practices.',
      ],
    },
    {
      id: 'topic-ai-writing-assistance',
      name: 'AI Writing Assistance',
      category: 'intersecting',
      description: 'How writing tools help authors improve their work while retaining control over meaning and expression.',
      enabled: true,
      keyTerminology: [
        'author control',
        'writing quality',
        'voice & tone',
        'trust & transparency',
        'interaction feedback',
      ],
      conventions: [
        'Connect writing-assistance concepts to the interactions actually described.',
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
export function presetToDomainExpertise(
  preset: DomainPreset,
  existingProductKnowledge?: ProductReference[]
): DomainExpertise {
  return {
    enabled: true,
    field: preset.field,
    disciplines: [...preset.disciplines],
    topics: preset.topics.map((t) => ({
      ...t,
      keyTerminology: [...t.keyTerminology],
      conventions: [...t.conventions],
    })),
    keyTerminology: [],
    conventions: [],
    audienceContext: preset.audienceContext,
    customNotes: preset.customNotes,
    productKnowledge: existingProductKnowledge ? [...existingProductKnowledge] : [],
  };
}

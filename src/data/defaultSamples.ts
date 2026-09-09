import { WritingSample, StyleProfile } from '../types';

export const DEFAULT_SAMPLES: WritingSample[] = [
  {
    id: 'sample-1',
    title: 'The Architecture of Unhurried Thought',
    fileType: 'md',
    fileName: 'unhurried-thought.md',
    content: `Most people write to be done. You can see it in the frantic rhythm of the prose—clauses tumbling into one another like commuters shoving onto an outbound train.

I prefer a different cadence.

When I sit down at the desk in early morning, the quiet is physical. Before I write a single noun, I listen for the pulse of the room. Good sentences don't just convey information; they have weight, like river stones placed deliberately across a shallow creek. Some are flat and quick—stepping stones. Others require you to pause, balance for a second, and take in the chill of the water before moving forward.

We have traded depth for velocity. We churn out paragraphs loaded with passive constructions and throat-clearing preambles because we are terrified of silence. But the sharpest writers know that white space is punctuation. A three-word sentence after a rolling forty-word clause isn't an accident; it is an ambush. It grabs the collar of your mind and pulls you close.

If a paragraph doesn't surprise me by the time I reach the final period, I strike it through. Writing is not transcription. It is excavation.`,
    wordCount: 182,
    charCount: 1102,
    createdAt: '2026-09-01T10:00:00.000Z',
    enabled: true,
    analysis: {
      summary: 'Lyrical yet disciplined essayistic voice characterized by staccato declarative breaks interspersed between expansive sensory metaphors.',
      wordChoice: {
        vocabularyLevel: 'Elevated yet grounded and tactile',
        sensoryRichness: 88,
        favoredRegisters: ['Sensory physical verbs (tumble, churn, strike, grab)', 'Natural metaphors (river stones, shallow creek, excavation)', 'Anglo-Saxon root words over Latinate abstracts'],
        lexicalDensity: 'High semantic charge with zero corporate or academic filler',
        avoidedPatterns: ['Hedge phrases ("arguably", "somewhat")', 'Passive voice', 'Jargon and buzzwords', 'Throat-clearing openers ("In order to understand...")'],
        keyPhrases: ['physical quiet', 'throat-clearing preambles', 'white space is punctuation']
      },
      sentenceStructure: {
        avgSentenceLength: 14.8,
        lengthDistribution: {
          shortUnder10: 42,
          medium10to25: 38,
          longOver25: 20
        },
        syntaxType: 'Paratactic alternation with deliberate staccato punches',
        activeVoicePercentage: 94,
        punctuationSignatures: {
          emDashes: 'frequent',
          semicolons: 'moderate',
          parentheticals: 'rare',
          fragments: 'moderate'
        },
        sentenceOpeners: ['Direct declarative assertions', 'Sensory time/place anchors ("When I sit...")', 'Strong oppositions ("We have traded...")']
      },
      rhythmAndPacing: {
        cadence: 'Dynamic burstiness: expansive multi-clause reflections resolved abruptly with 3-5 word knockout sentences.',
        burstinessScore: 84,
        paragraphLength: 'Short to medium blocks (1-4 sentences), generous breathing room',
        transitionStyle: 'Organic conceptual leaps rather than mechanical signposts ("However", "Furthermore")'
      },
      voice: {
        persona: 'Reflective craftsman with quiet conviction and poetic precision',
        perspective: 'first_person',
        intimacy: 85,
        ironyLevel: 25,
        authorityPosture: 'Grounded in tactile personal observation and aesthetic discipline'
      },
      tone: {
        formalityScore: 62,
        warmthScore: 78,
        confidenceScore: 90,
        emotionalResonance: 'Contemplative, evocative, deliberate, and arresting',
        primaryAttributes: ['Measured', 'Tactile', 'Unapologetic', 'Atmospheric']
      },
      rules: [
        'Use physical, tactile metaphors instead of abstract concepts.',
        'Alternate long rhythmic descriptive clauses with short 3-5 word declarative punches.',
        'Cut opening filler and throat-clearing; start directly with the central tension.',
        'Rely on em-dashes for spontaneous internal realizations.',
        'Maintain a confident, warm first-person presence.'
      ],
      notableExcerpts: [
        {
          quote: 'A three-word sentence after a rolling forty-word clause isn\'t an accident; it is an ambush.',
          commentary: 'Signature rhythmic signature: combines meta-commentary with tactile military metaphor and semicolon balance.'
        },
        {
          quote: 'Writing is not transcription. It is excavation.',
          commentary: 'Staccato dual-beat aphorism establishing strong authority.'
        }
      ]
    }
  },
  {
    id: 'sample-2',
    title: 'On Tools, Craft, and the Myth of Raw Speed',
    fileType: 'md',
    fileName: 'tools-and-craft.md',
    content: `Every season brings a fresh crop of productivity panaceas—shiny software claiming to compress an afternoon's toil into four painless keystrokes. We adopt them eagerly, convinced that friction is an enemy to be exterminated.

It isn't.

Friction is often where discernment happens. When a master woodworker selects a drawknife, they are not searching for the fastest path to turn timber into sawdust; they are courting resistance. The grain of the wood talks back. It forces a conversation between intent and material.

Software that promises effortless output usually delivers thoughtless artifacts. If you never have to wrestle with an idea—if your thoughts bypass the muscular labor of drafting, pruning, and second-guessing—you don't end up with more insight; you just end up with faster mediocrity.

Real craftsmanship is stubborn. It insists on taking the long way around because the long way is where the texture lives. Build things that remember human hands were on them.`,
    wordCount: 154,
    charCount: 978,
    createdAt: '2026-09-02T14:30:00.000Z',
    enabled: true,
    analysis: {
      summary: 'Incisive analytical polemic blending artisan metaphors with sharp cultural critique and crisp rhythmic cadences.',
      wordChoice: {
        vocabularyLevel: 'Sharp, literary-pragmatic with tactile artisan phrasing',
        sensoryRichness: 82,
        favoredRegisters: ['Artisan vocabulary (timber, sawdust, grain, drawknife, texture)', 'Crisp active verbs (court, prune, wrestle, bypass)', 'Precise intellectual nouns (discernment, resistance, mediocrity)'],
        lexicalDensity: 'Tight and muscular; no bloated nominalizations',
        avoidedPatterns: ['SaaS jargon ("streamline", "scale", "optimize")', 'Clichés and platitudes', 'Passive voice constructions'],
        keyPhrases: ['muscular labor of drafting', 'faster mediocrity', 'where the texture lives']
      },
      sentenceStructure: {
        avgSentenceLength: 13.9,
        lengthDistribution: {
          shortUnder10: 36,
          medium10to25: 46,
          longOver25: 18
        },
        syntaxType: 'Antithetical parallelism and staccato refutations',
        activeVoicePercentage: 96,
        punctuationSignatures: {
          emDashes: 'frequent',
          semicolons: 'frequent',
          parentheticals: 'rare',
          fragments: 'frequent'
        },
        sentenceOpeners: ['Challenging assertions', 'Isolated single-clause refutations ("It isn\'t.")', 'Conditional hooks ("If you never...")']
      },
      rhythmAndPacing: {
        cadence: 'Muscular, rhythmic counterpoint. Uses isolated two-word paragraphs as rhetorical pivots.',
        burstinessScore: 88,
        paragraphLength: 'Tight, 2-3 sentence groupings centered around a single philosophical grain',
        transitionStyle: 'Ideological contrasts and concrete parables'
      },
      voice: {
        persona: 'Cultured contrarian with deep reverence for manual and intellectual rigor',
        perspective: 'mixed',
        intimacy: 75,
        ironyLevel: 45,
        authorityPosture: 'Incisive observer drawing universal principles from physical disciplines'
      },
      tone: {
        formalityScore: 68,
        warmthScore: 65,
        confidenceScore: 92,
        emotionalResonance: 'Challenging, lucid, passionate, grounded',
        primaryAttributes: ['Incisive', 'Artisanal', 'Unyielding', 'Luminous']
      },
      rules: [
        'Use single-sentence or fragment paragraphs as pivotal turning points.',
        'Ground abstract critiques in physical hand-craft analogies (woodworking, masonry, sculpting).',
        'Frame arguments through sharp binary oppositions (effortless output vs. thoughtless artifacts).',
        'Favor verbs of physical struggle (wrestle, prune, court resistance).',
        'End on an imperative rallying cry for tactile human agency.'
      ],
      notableExcerpts: [
        {
          quote: 'It isn\'t.',
          commentary: 'Rhetorical knockout punch after a long multi-clause opening paragraph.'
        },
        {
          quote: 'Build things that remember human hands were on them.',
          commentary: 'Poetic imperative conclusion tying together tactile and moral philosophy.'
        }
      ]
    }
  }
];

export const DEFAULT_PROFILE: StyleProfile = {
  id: 'profile-primary',
  name: 'Authentic Craftsman and Essayist',
  description: 'Synthesized from your essays on craft and unhurried thought. A tactile, rhythmic, high-conviction voice that balances sensory metaphors with punchy declarative clarity.',
  sampleIds: ['sample-1', 'sample-2'],
  updatedAt: '2026-09-02T15:00:00.000Z',
  metrics: {
    formality: 65,
    avgSentenceLength: 14.3,
    sentenceLengthVariance: 86,
    lexicalSophistication: 85,
    warmth: 72,
    directness: 91,
    activeVoiceRatio: 95,
    metaphorDensity: 80
  },
  voiceManifesto: `You write with the tactile assurance of someone who views prose as sculpture. You hate hollow jargon, buzzwords, and passive evasion. Every sentence has a rhythmic reason to exist. You balance lush, sensory analogies—frequently drawn from physical craft, geology, natural light, and manual labor—with staccato, unapologetic declarative punches. You never explain what can be felt, and you treat white space as an active instrument of punctuation.`,
  synthesizedGuidelines: {
    doList: [
      'Alternate between expansive rolling clauses (25-35 words) and sharp declarative punches (3-6 words).',
      'Use physical, tactile verbs (excavate, wrestle, court, strike, anchor) over passive or abstract phrasing.',
      'Ground intellectual insights with tangible material metaphors (stone, timber, grain, river).',
      'Use em-dashes for spontaneous internal reflection and semicolons for rhythmic parallelism.',
      'Cut throat-clearing openers ("It is worth noting that...", "In today\'s fast-paced world...").'
    ],
    dontList: [
      'Never use corporate buzzwords ("synergy", "streamline", "leverage", "paradigm shift").',
      'Avoid passive voice ("It was decided by the team").',
      'Do not write uniform, monotone sentence lengths.',
      'Avoid weak hedge words ("somewhat", "arguably", "perhaps it could be said").',
      'Never sacrifice concrete meaning for empty ornamental adjectives.'
    ],
    signatureHabits: [
      'Isolated single-line paragraphs ("It isn\'t.") acting as intellectual tripwires.',
      'Metaphors contrasting speed/velocity with depth/discernment.',
      'Rhythmic dualities ("It is not X; it is Y").',
      'Closing on a memorable imperative sentence.'
    ],
    vocabularyPreferences: [
      'Tactile nouns: grain, timber, stone, friction, weight, texture, blueprint',
      'Kinetic verbs: tumble, churn, carve, court, prune, anchor, strike',
      'Avoid: utilize, implement, maximize, bandwidth, low-hanging fruit'
    ],
    pacingGuide: 'High burstiness. Build tension through layered, sensory description, then shatter it with an immediate, definitive statement.'
  },
  customDirectives: 'Maintain strong authorial conviction. Never apologize for having an opinion. Always keep the reader leaning in.',
  domainExpertise: {
    enabled: false,
    field: 'UX Copywriting & Content Design',
    disciplines: ['UX Copywriting', 'Content Design'],
    topics: [],
    keyTerminology: [],
    conventions: [],
    audienceContext: 'Design directors, VP of Product, design leads, hiring managers, and cross-functional product partners evaluating portfolio case studies.',
    customNotes: 'Use domain knowledge to recognize thinking already demonstrated in the draft. Name or explain a concept when it makes the reasoning clearer, alongside the concrete decision or example. Keep the language accessible. Do not invent actions, intentions, evidence, or outcomes.',
    productKnowledge: [],
  }
};

export const SAMPLE_DRAFT_TO_REWRITE = `Subject: Proposal for Improving Team Documentation and Productivity

In today's fast-paced corporate environment, it is arguably imperative that our cross-functional teams look into the strategic optimization of our internal documentation workflows. It has been observed by several stakeholders that there are a lot of inefficiencies currently existing in the manner in which knowledge transfer is being executed across different departmental silos.

In order to address these challenges, we should probably consider implementing a new centralized documentation platform that can streamline our processes and maximize collaborative bandwidth. When documentation is created in an ad-hoc fashion without synergistic alignment, key insights are often lost, which can lead to suboptimal outcomes for all involved parties.

Moving forward, it is recommended that team members should try to dedicate some time each week toward updating their respective project trackers. By leveraging these modern collaborative tools, our overall velocity could potentially be increased by a significant margin. We hope everyone will get on board with this important initiative so we can hit our quarterly deliverables.`;

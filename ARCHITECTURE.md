# Architecture

How PersonaScript is built and how data moves through it. Product behaviour and
UI copy are owned by [README.md](./README.md); the visual system by
[DESIGN.md](./DESIGN.md). This file owns structure, contracts, and invariants.

## Shape

One process, one origin. `server.ts` is an Express app that serves the API and,
in development, mounts Vite as middleware for the React client. `npm run dev`
runs `tsx watch server.ts`, which restarts the server when `server.ts` or any
file it imports changes; the client hot-reloads through Vite. `npm run build`
bundles the client with Vite and the server with esbuild into `dist/`.

There is no database. All user state lives in the browser's `localStorage` for
the exact origin. The server holds only provider API keys (in the untracked
`.env`, written by `/api/connections`) and is otherwise stateless.

```
browser ──── React client (src/) ──── fetch ──── Express (server.ts) ──── provider APIs
   │                                                     │
localStorage                                     src/aiProvider.ts
(personascript_*)                        Gemini · OpenAI · OpenRouter
```

## Client

- `src/App.tsx`, `src/components/Header.tsx` — shell and the five numbered
  tabs: Writing Samples → Voice Blueprint → Draft & Brief → Domain Knowledge →
  Rewrite Studio. Navigation is free; nothing generates on entry.
- `src/context/WritingAssistantContext.tsx` — the single state owner. Every
  view reads and writes through `useWritingAssistant()`. It loads and saves
  each `localStorage` key, runs every API call, and holds the operation locks
  (`isRewriting`, `isPlanning`, …) that keep concurrent writes out.
- Views: `SamplesView`, `ProfileView`, `DraftBriefView`, `DomainView` (split
  into `DomainTopicsSection` and `DomainProductsSection`), `StudioView`. Views
  share `StepFooter`. Studio composes `SelectionToolbar` (floating selection
  affordance), `EditorialDecisions` (suggestions), `StudioDraftControls`
  (strength and locks, source side only), `RewriteFeedbackManager` (post-rewrite
  request), `DiffViewer` (track changes), `WritingReviewPanel`, `RewriteHistory`.
- Shared modules imported by both client and server: `src/types.ts`,
  `src/editorialPlan.ts`, `src/writingPipeline.ts`, `src/planAssertionReview.ts`,
  `src/sourceText.ts`, `src/domainGeneration.ts`, `src/modelChoice.ts`. They
  contain no DOM or Node-only code so the same validators run on both sides.
- `src/utils/` — pure helpers: `editorialSummary` (what the rail shows),
  `diffHelper` (paragraph alignment for track changes), `richText` (Markdown
  rendered as formatting; `plainText` for comparing and quoting),
  `passageSelection` (a DOM selection located in the saved text),
  `rewriteHistory`, `studioWorkspace`, `reviewEvidence`, `voiceFeedback`,
  `stylePreference`.

### Browser storage keys

| Key | Owner | Holds |
|---|---|---|
| `personascript_samples_v2` | context | writing samples and their analyses |
| `personascript_profile_v2` | context | the voice blueprint (`StyleProfile`), including `domainExpertise` |
| `personascript_history_v2` | context via `utils/rewriteHistory` | last 20 completed versions (`RewriteResult[]`) |
| `personascript_workspace_v1` | context via `utils/studioWorkspace` | current draft, brief, reader & purpose, standing preferences, current plan state, current result, instructions, intensity |
| `personascript_tone_v2`, `personascript_preservation_v2`, `personascript_model_settings_v1` | context | tone sliders, locks, model choices |

Keys are versioned by suffix. A reader must accept every shape a key has ever
held (`normalizeRewriteHistory`, `isEditorialPlanState`); a shape change means a
new suffix or a normaliser, never a silent drop.

## Server routes

| Route | Model role | Purpose |
|---|---|---|
| `GET /api/health`, `GET /api/models`, `POST/DELETE /api/connections`, `GET /api/logs` | — | status, catalogues, key management (localhost only) |
| `POST /api/extract-text`, `/api/fetch-link`, `/api/discover-portfolio` | analysis (scanned PDFs only, never for `localOnly` uploads) | document and web import |
| `POST /api/analyze-sample`, `/api/synthesize-profile` | analysis | sample analysis and voice blueprint |
| `POST /api/generate-domain-knowledge` | analysis | domain topics and product notes |
| `POST /api/plan-draft` | analysis | editorial plan (suggestions) |
| `POST /api/rewrite-draft` | writer, then analysis ×2 | planned rewrite, source audit, prose review |
| `POST /api/quick-refine`, `/api/edit-selection` | writer, then analysis | follow-up edits to the current version |
| `POST /api/learn-from-feedback` | analysis | rewrite the blueprint from saved style notes |

`src/aiProvider.ts` normalises the three providers behind one
`generateContentWithRetry` call (structured output via schema, reasoning
effort, abort on client disconnect, no cross-provider fallback).
`src/providerConnections.ts` validates and stores keys. Every route validates
its body with the shared validators before building a prompt; oversize input is
an error, never truncated.

## The writing pipeline

Each phase produces one artefact that later phases consume. Nothing is
regenerated implicitly.

1. **Writing Samples** → `RawWritingSample[]` (text + optional analysis).
   Consumed by the writer as the voice corpus (≤ 100,000 chars) and by
   blueprint synthesis. Never sent to planning or review.
2. **Voice Blueprint** → `StyleProfile`. Its numeric metrics and expression
   directives reach the writer; names, manifestos, and vocabulary lists do
   not. `hasFreshProfileGuidance()` tells Studio when the blueprint is older
   than its samples.
3. **Draft & Brief** → `draftText` (the editorial target and only source
   account), `projectBrief` (a second factual source), `readerPurpose`,
   `editorialPreferences` (standing rules; default in
   `DEFAULT_EDITORIAL_PREFERENCES`). All four feed planning; all four feed
   writing; draft and brief feed the audit and review.
4. **Domain Knowledge** → `DomainExpertise` on the profile. Feeds the writer
   and reviewer as interpretive background, never as factual authority; the
   planner also receives it as interpretation context. It is deliberately
   outside `EditorialPlanState.sources`, so toggling a topic does not make an
   approved plan stale.
5. **Rewrite Studio** — three model calls in order, each gated by the last:
   - **Plan** (`/api/plan-draft`, `buildEditorialPlanPrompt`) reads draft,
     brief, reader & purpose, standing preferences, the rewrite request, and
     the domain block (interpretation only, optional). Returns an
     `EditorialPlan` (below). Validated by `validateGeneratedPlan`.
   - **Approve** (client, `approveEditorialPlan`) re-validates the plan
     against the exact current sources (`validateSectionPlan`) and freezes a
     snapshot `{ plan, sources, approved: true }`. The server re-validates the
     same snapshot in `validateApprovedPlan` before writing.
   - **Write** (`/api/rewrite-draft`, `buildRewritePrompt`) receives the
     corpus, blueprint guidance, domain block, locks, and the plan as JSON
     (`editorialPlanBlock`). Returns prose (`validateGeneratedProse`).
   - **Audit + review** (`reviewDraft` in `server.ts`): the analysis model
     first audits the approved plan against draft and brief only
     (`planAssertionReview.ts`, exact-quote evidence), then reviews the prose
     against the plan, the sources, and the local preservation checks
     (`buildReviewPrompt`). Audit failure degrades to one warning finding;
     review failure returns `unavailableReview` and keeps the prose.
   - **Follow-up edits** (`/api/quick-refine`, `/api/edit-selection`) revise
     the current version with the same locks and the saved plan context, then
     review again. **Keep original / Restore / Remove** in track changes edit
     the text locally (`updateRewrittenText`) with no model call and drop the
     stale review. **Delete** in History removes a version from
     `personascript_history_v2` (`deleteRewriteVersion`); deleting the open
     version clears `rewriteResult`, so the Studio shows the original draft.

### The editorial plan contract (version 4)

Defined in `src/types.ts` (`EditorialPlan`), validated in `src/editorialPlan.ts`.

- `openingJob` — one sentence on what the opening must do, drawn only from what
  the draft's opening already states.
- `items[]` — one per claim inside a section (a contiguous `paragraphRange`,
  inclusive, 1-based over `getDraftParagraphs(draft)`). A passage that needs its
  own treatment or its own limit gets its own item; ideas that share a treatment
  and carry no claim may share one. Ranges must cover every paragraph with no
  gaps. Each item: `decision` keep | shorten | cut; `idea` (what changes;
  required unless keep); `reason` (why; required at generation);
  `sourcePhrase` (verbatim, must occur inside the range); `limit` (how far this
  passage's claim may go; required at generation whenever the range contains a
  figure, empty otherwise); `response` (author's answer: accepted | rejected |
  ignored). Rejected and ignored items are normalised to keep at approval.
- `conflicts[]` — every evidenced draft/brief contradiction, asked once at the
  top with both quotations verbatim; `resolution` must be set before approval.
- `requests[]` — the author's own passage requests: `paragraphRange`,
  verbatim `sourcePhrase`, `instruction`. They outrank the item covering that
  passage.

Sections are not stored. The rail derives them from the draft's headings at
display time (`sectionPlan()`): a section runs from a heading, or paragraph 1,
to the paragraph before the next heading. The writer and reviewer receive the
whole plan. Version 3 plans (one item per section) still load, display in the
same section grouping, and remain approvable; version 2 plans (one item per
paragraph, per-item conflicts) still load and display as a notice, and are
replaced rather than approved (`planNeedsReplacement`), approved or not.
`PLAN_FIELD_LIMITS` and `PLAN_MAX_ITEMS` are ceilings on saved data and must
not shrink without a normaliser.

### Where the rules live

Fidelity and attribution rules are stated once, in `WRITING_SYSTEM_INSTRUCTION`
and `DEFAULT_EDITORIAL_PREFERENCES`. The planner applies them per passage in
`limit`, quoting the passage's own words; it does not copy the rule text. The
reviewer is told they apply. If a rule needs to change, change it there, not in
a prompt that quotes it.

## Invariants

- No text is generated without an explicit user action; nothing runs on entry
  to a tab.
- The writer only ever receives a plan that was approved against the exact
  sources it was planned from; a changed source makes the plan stale.
- Quotations in plans, requests, conflicts, and audit evidence are verified
  verbatim against their source (`sourceContainsPhrase`); no paraphrase
  passes.
- Saved input is never truncated or discarded on read. Oversize input reports
  an error and stays recoverable.
- Every stored shape remains readable: new fields are optional, old versions
  are normalised, keys are suffixed.
- Review is advisory. It never edits prose; a failed review keeps the result.
- Planning and review never see the voice corpus or blueprint; the writer
  never sees the audit.

## Tests

`npm test` runs `node --import tsx --test tests/*.test.ts`: deterministic tests
of validators, prompt contents, summaries, alignment, and persistence. They
prove the contract and the deterministic code paths, not that a model will
comply with a prompt. `npm run lint` is `tsc --noEmit`.

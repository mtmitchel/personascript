# Restore editorial decision-making after the Studio simplification

Repository: `mtmitchel/personascript` at `/home/mason/Projects/persona script`.
This file is a one-time implementation plan. It is not a documentation owner
(`AGENTS.md` names README, ARCHITECTURE, DESIGN as the only owners and says
"do not add a fourth document"). Delete it, or move it to
`evaluation-artifacts/`, once the work is merged.

## 1. Problem

Between 9 and 11 September the Studio UI was simplified. An audit of the git
history (`2c95990` → `116a472` → working tree), the Fable transcript
(`~/Downloads/PersonaScript quality.md`), and the live pipeline found:

- **Nothing was removed by accident.** Every mechanism the transcript required
  is present in HEAD: typed fidelity classes (`qualitativeFidelityBlock`),
  reader-and-purpose in every prompt, reviewer as proposition alignment with
  paired evidence and no corpus, plan-source audit before the prose review,
  verbatim quotation checks, per-paragraph coverage, `DEFAULT_EDITORIAL_PREFERENCES`
  in planner, writer and reviewer, and no full rewrite without an approved plan.
- **One deliberate dilution.** Commits `1da1d00`/`c275aa8` replaced the
  paragraph-level planner (v2: one item per paragraph, `limit` required and
  stating permitted claim strength) with the section-level planner (v3: 5–10
  items, `limit` "usually empty", keep items blank). This was a reaction to a
  72-row panel Mason rejected
  (`evaluation-artifacts/studio-simplification-2026-09-10/user-rejection.txt`).
  Result on the DeepL draft: 7 items, all `shorten`, 3 with limits, 0 with
  reasons, and an `openingJob` ("Establish the gap between generic upgrade
  offers and users' immediate tasks") that introduced a diagnosis the draft
  never makes. The writer executed it ("leaving a distinct gap… earlier
  prompts interrupted them with abstract sales pitches"); the reviewer caught
  it as an error. Mason chose to restore claim-level items, grouped by
  section in the UI.
- **Domain knowledge never reaches the planner.** `/api/plan-draft` whitelists
  only draft, brief, reader-purpose, preferences, custom instructions, model
  settings (server.ts ~1336). The Domain Knowledge tab's "generate topics"
  (`/api/generate-domain-knowledge`) reads the draft and brief, but its output
  flows only to the writer and reviewer. The writer gets `domainBlock` but not
  the "Concept recognition" bullet, which survives only in the legacy
  `sharedGuardrails` path no longer used for full rewrites. Mason chose to
  send domain context to the planner.
- **The brief's caveats leak into prose.** The last rewrite contains "In my
  interpretation…", "this historical screen's offer rather than current
  specifications…", and "designed directions rather than confirmed final test
  winners or fully shipped screens" — none in the draft, all from the brief's
  notes on what the record establishes. Mason chose to add a writer rule.
- **Feedback learning can overwrite the user's directive.**
  `/api/learn-from-feedback` spreads `parsed.updatedProfile` over the profile
  pinning only `id`, `sampleIds`, `domainExpertise`; `customDirectives` is in
  the response schema. Same in `persistFeedbackProfile`.

Findings from the last rewrite (export `draftText Tailoring DeepL.txt`, 1,818 →
1,021 words, intensity `transform`, writer `google/gemini-3.8-flash`, planner
and reviewer `openai/gpt-6-astra`): the reviewer's four errors were all
genuine (opening escalation, quotation-lock breach on "translate larger
files", "repetitive manual edits" → "eliminated manual editing", retained
recap the plan cut). Headings were preserved verbatim; the title lock held;
12 % and €1.2 M were attributed to the program as the preferences require.
Voice recognisability against `writing-samples-2026-09-10/` was not measured.

## 2. Approach

Five changes, in dependency order. Each is small and self-contained. All are
in `src/`, `server.ts`, tests, and the three documentation owners. No new
dependencies. No new storage keys. Old saved plans (v2, v3) must keep loading.

Constraints that apply throughout (from `AGENTS.md`):

- Run `npm run lint` and `npm test` after any change to `src/` or `server.ts`.
- Never restart the user's `npm run dev` on port 3000. Rendered checks use a
  private port (the earlier session used 3100).
- Do not restate fidelity rules in prompts; they live once in
  `WRITING_SYSTEM_INSTRUCTION` and `DEFAULT_EDITORIAL_PREFERENCES`.
- Studio copy never shows internal vocabulary (decision, passage, anchor,
  limit, treatment, coverage, paragraph IDs).
- `localStorage` shapes stay readable; add optional fields, never shrink limits.
- Do not loosen `sourceContainsPhrase`.
- Commit only when Mason asks; use the Copilot co-author trailer.

---

## 3. Todo 1 — Plan version 4: claim-level items grouped by section

### 3.1 Contract (`src/types.ts`, `EditorialPlan` ~143)

```ts
version?: 2 | 3 | 4;
```

Update the doc comment: "Version 4 keeps version 3's shape but plans by
passage inside each section: one item per distinct claim or idea that needs
its own treatment or its own limit; `limit` is required for any passage that
carries a claim about results, user behaviour, causality, ownership,
comparative importance, intention, or degree." No new fields. Sections are
derived from the draft's headings at display time, not stored.

### 3.2 Validators (`src/editorialPlan.ts`)

- `isEditorialPlan` (~93): accept `plan.version === 4`; the `paragraphRange`
  requirement `(plan.version !== 3 || item.paragraphRange !== undefined)`
  becomes `((plan.version !== 3 && plan.version !== 4) || item.paragraphRange !== undefined)`.
- `validateEditorialPlan` (~183): `if (value.version === 3 || value.version === 4) return validateSectionPlan(value, sources, options);`
- `validateSectionPlan` (~149): return `version: value.version` instead of
  the literal `3`. Add a generation-only check controlled by a new option
  `requireClaimLimits?: boolean` in `EditorialPlanValidationOptions`:

  ```ts
  // A passage that carries a figure carries a claim; the planner must state
  // how far the writer may take it. Generation only; approval trusts the author.
  if (options.requireClaimLimits && /\d/.test(rangeText(range)) && !item.limit.trim()) {
    throw new ValidationError(`Suggestion ${index + 1} covers a figure; say in limit how far the writer may take that claim.`);
  }
  ```

  Place it after the `sourcePhrase` check and before the rejected/ignored
  normalisation. The regex runs on the item's range text, so a multi-
  paragraph item that spans a paragraph with any digit needs a limit. That is
  intended: it pushes the planner to split figure-bearing passages into their
  own items.
- `validateGeneratedPlan` (~228): `if (parsed?.version !== 4) throw new ValidationError('The proposal is missing its required format.');`
  and call `validateEditorialPlan(normalized, sources, { allowPendingConflictEvidence: true, requireReasons: true, requireClaimLimits: true })`.
- `EDITORIAL_PLAN_SCHEMA` (~10): add `'limit'` to the item `required` array so
  it becomes `['paragraphRange', 'decision', 'idea', 'reason', 'sourcePhrase', 'limit']`.
  `validateGeneratedPlan` already normalises `null` to `''`.

### 3.3 Planner prompt (`buildEditorialPlanPrompt`, `src/editorialPlan.ts` ~245)

Replace the second paragraph ("Read the whole draft and brief… Never write one
decision per paragraph.") with:

> Read the whole draft and brief. Apply the standing editorial preferences
> when supplied; they guide choices, not source facts. Plan by passage inside
> each section. A section is a contiguous run of numbered paragraphs, normally
> one heading and the paragraphs under it; paragraphs marked as headings below
> start a section. Inside a section, write one suggestion for each distinct
> claim or idea that needs its own treatment or its own limit. Ideas that
> share a treatment and carry no claim may share one suggestion spanning
> their paragraphs. Never write one suggestion per sentence. Always write a
> separate suggestion for a passage that carries a measured result, a claim
> about user behaviour, a cause, an attribution of work or ownership, a
> comparative rank such as "a key part" or "the main", a purpose such as
> "was to", or a degree such as "often" or "some". A piece of this length
> normally needs fifteen to thirty suggestions.

Replace the `limit` field bullet with:

> - limit: required whenever the passage carries a claim of the kinds listed
>   above; otherwise empty. One sentence of at most 40 words that applies the
>   standing preferences to this passage's own words: quote the operative
>   words and say how far the writer may take them, for example `Keep "a key
>   part" as one part among several; not the centrepiece.` or `The 12% and
>   €1.2M belong to the Monetization team's program, not to the author.` Do
>   not copy the general rules; state only what is specific to this passage.

Replace the `openingJob` bullet with:

> openingJob: exactly one sentence of at most 30 words saying what the
> opening must establish for this reader, drawn only from what the draft's
> opening already states. Do not introduce a diagnosis, a gap, a contrast, or
> a cause the draft does not make. Not a drafted opening and not a list of
> what the piece covers.

Change the closing line `Return JSON matching the schema with version: 3.`
to `version: 4`. Leave every other paragraph as is (keep/shorten/cut
definitions, background-vs-reasoning paragraph, `idea`/`reason`/`sourcePhrase`
bullets, conflicts, plain-language paragraph, size limits).

### 3.4 Writer block (`src/writingPipeline.ts`)

`editorialPlanBlock` (~571): change `if (plan.version !== 3)` to
`if (plan.version !== 3 && plan.version !== 4)`. The v3 branch already sends
`limit` when non-empty; no other change. In `plannedWritingGuidance` (~592),
extend the sentence "A decision may cover a range of paragraphs; its reason
explains…" with: "Where a decision carries a limit, it states exactly how far
that passage's claim may go; do not exceed it and do not soften it into a
disclaimer."

### 3.5 Section grouping (`src/utils/editorialSummary.ts`, `sectionPlan` ~46)

Keep the existing return keys (`cuts`, `tightens`, `keeps`, `pending`,
`requests`, `conflicts`, `unresolvedConflicts`) so `planReadiness`, tests, and
`SavedEditorialDecisions` keep working. Add a `sections` array:

```ts
export interface PlanSectionGroup {
  name: string;           // headingText(first paragraph) or `Paragraphs a–b`
  from: number; to: number;
  items: PlanSection[];   // draft order
  changes: number;        // shorten + cut
  limited: number;        // items with a non-empty limit
}
```

Algorithm:

1. `paragraphs = getDraftParagraphs(draft)`. Section starts = ids of
   paragraphs where `isHeadingParagraph(text)`; if paragraph 1 is not a
   heading, prepend 1. Each section runs from its start to the next start − 1
   (the last runs to `paragraphs.length`). A draft with no headings yields one
   section named `Paragraphs 1–N`.
2. Assign each item to the section whose range contains `item.from`.
3. Item naming inside a section (replace the current `name` logic): if the
   item's range equals the section's range, `name = section.name`; otherwise
   `name = '“' + planPreview(item.sourcePhrase, 70) + '”'`. Drop the
   keep-`idea` fallback (v4 keeps have empty `idea`).
4. `sections` ordered by `from`; items inside by `from`, then `to`.

### 3.6 Suggestions panel (`src/components/EditorialDecisions.tsx`)

Screen brief — job: answer the model's suggestions so the rewrite can run;
object: a suggestion about a passage of the author's draft; done: no
unresolved conflict and the author has read the list.

Structure, top to bottom:

1. Read-only / stale / missing-coverage notices — unchanged.
2. "Your draft and brief disagree" — unchanged.
3. "Your requests" — unchanged.
4. "Opening" — unchanged.
5. **One `<details className="studio-note-section">` per `PlanSectionGroup`,
   in draft order.** Replaces the current "Cut", "Tighten", and "Unchanged"
   groups. Depth: section (1) → suggestion row (2). No third level.
   - `<summary>`: section name in `.studio-note-name`, then a muted count in
     the existing `.studio-note-state` class: `{changes} change` /
     `{changes} changes` when > 0, otherwise `Unchanged`.
   - `open` by default when `changes > 0 || limited > 0`; closed when the
     section is all keeps with no limits.
   - Body: `<ul>` of rows in draft order via the existing `renderSuggestion`,
     extended:
     - shorten/cut rows: as today (name — idea; reason line; Accept/Reject/
       Ignore, or state + Undo).
     - keep rows **with** a limit: name, then the limit line; no
       accept/reject controls (nothing to answer).
     - keep rows **without** a limit: omitted from the list; instead one
       muted line at the bottom of the body, `Unchanged: “…” · “…”`, using the
       existing `.studio-note-kept` class and the hover-highlight spans as
       today.
     - Limit line: `<p className="studio-note-reason">Do not go beyond: {compactPlanText(limit)}</p>`.
       "Do not go beyond" is plain English; the word "limit" must not appear
       in the UI. `ux-copywriter` may refine the label later.
   - Hover/focus highlight of the paragraph range: unchanged.
6. When `note.cuts.length + note.tightens.length === 0`, keep the existing
   sentence "No section changes suggested; the rewrite adjusts wording only."
   above the sections.

Legacy guard `if (plan.version !== 3 && !editorialPlan.approved)` becomes
`if (plan.version !== 3 && plan.version !== 4 && !editorialPlan.approved)`.
v3 plans display in the new grouping (they are flat ranged items).

`SavedEditorialDecisions` (~232): same `<details>` grouping, read-only,
closed by default except sections with changes.

CSS (`src/index.css`): `.studio-note-section > summary` — cursor pointer,
`list-style: none`, same padding and type as `.studio-note-heading`; reuse a
chevron pattern if one exists in the file, otherwise the default marker.
Document the class in `DESIGN.md` next to the other `studio-note-*` classes.

Check report to include in the final message, one line each: placement,
hierarchy, scan path, one object per label, depth (two levels), convention
(native `<details>`), simplification floor.

### 3.7 Tests

- `tests/editorialPlan.test.ts`: add a `v4Plan` fixture (copy the v3 fixture
  at ~235, set `version: 4`, give a figure-bearing item a limit). Cases:
  `isEditorialPlan` accepts v4; `validateGeneratedPlan` rejects a `version: 3`
  response and accepts v4; with `requireClaimLimits` a figure-bearing item
  without `limit` throws with "covers a figure"; `validateSectionPlan`
  returns `version: 4` for v4 input and `3` for v3; `buildEditorialPlanPrompt`
  contains "one suggestion for each distinct claim", "Do not introduce a
  diagnosis", and "version: 4", and does not contain "five to ten".
- `tests/editorialPlanPersistence.test.ts`: a saved v3 state and a saved v4
  state both pass `isEditorialPlanState`.
- `tests/writingPipeline.test.ts`: `editorialPlanBlock` for a v4 plan
  includes `limit` and omits empty ones; `buildRewritePrompt` with a plan
  contains "do not exceed it".
- `tests/editorialSummary.test.ts`: a draft with two headings and five items
  → two groups; item names use the quotation when narrower than the section;
  counts are right; a heading-less draft produces one group.

### 3.8 Documentation

- `ARCHITECTURE.md` "The editorial plan contract (version 3)" (line 129) →
  "(version 4)": items are per passage within a section; `limit` required for
  claim-bearing passages; sections derived from headings at display time; v2
  loads as a notice, v3 loads and displays in the new grouping and remains
  approvable. "Where the rules live" (line 154): replace "The planner is told
  not to restate them as per-item limits" with "The planner applies them per
  passage in `limit`, quoting the passage's own words; it does not copy the
  rule text."
- `README.md` lines 53 and 56: "one suggestion per section" → "suggestions
  grouped by section, one per claim or idea"; mention the "Do not go beyond"
  line.
- `DESIGN.md`: `.studio-note-section`.

---

## 4. Todo 2 — Domain context in the planner and concept recognition in the writer

### 4.1 Client (`src/context/WritingAssistantContext.tsx`, `generateEditorialPlan` ~838)

Request body becomes
`{ ...sources, domainExpertise, model: modelSettings.analysisModel, reasoningLevel: modelSettings.analysisReasoningLevel }`
where `domainExpertise` is the existing context value (line 322). Do **not**
add it to `sources`; `EditorialPlanState.sources`, `planMatchesSources`,
`planStaleReasons`, and `isEditorialPlanState` stay unchanged. Rationale:
domain is interpretation context that adds no facts; a topic toggle should
not invalidate an approved plan. Record this in ARCHITECTURE.md.

### 4.2 Server (`server.ts`, `/api/plan-draft` ~1328)

- Add `'domainExpertise'` to the whitelist array; update the error message to
  "…writing instructions, preferences, domain settings, and model settings."
- Validate: `const domain = body.domainExpertise === undefined ? undefined : normalizeDomainExpertise(requireObject(body.domainExpertise, 'domainExpertise') as DomainExpertise);`
  `normalizeDomainExpertise` is exported from `src/writingPipeline.ts` line
  290; add it to server.ts's import from `./src/writingPipeline` if absent.
- Call `buildEditorialPlanPrompt(sources, domain)`.

### 4.3 Prompt (`src/editorialPlan.ts`)

Signature `buildEditorialPlanPrompt(sources: EditorialPlanState['sources'], domain?: DomainExpertise | null)`.
Import `domainBlock` from `./writingPipeline` (reuse; do not write a second
domain formatter). Insert after `${editorialPreferencesBlock(...)}` and before
the "Rewrite request" block:

```
DOMAIN CONTEXT (interpretation only):
${domainBlock(domain)}
Use it to recognise a named principle, method, or trade-off the draft already demonstrates, and to judge whether this reader needs it kept or shortened. It adds no facts, requires no terminology, and is not evidence that the author performed work or achieved results.
```

`domainBlock(undefined)` returns "No domain settings are enabled.", so the
block is safe when the client sends nothing.

### 4.4 Writer (`src/writingPipeline.ts`, `plannedWritingGuidance` ~607)

Under `DOMAIN CONTEXT (interpretation only; no new claims or compulsory terminology):`
add, when `domain?.enabled`, the concept-recognition sentence currently at
`sharedGuardrails` line 639 (the bullet beginning "Concept recognition:
Domain knowledge provides broad disciplinary understanding…"). Extract that
bullet's text into a module-level constant `CONCEPT_RECOGNITION_RULE` used by
both functions so it is stated once.

### 4.5 Tests and docs

- `tests/editorialPlan.test.ts` ~399 ("planning prompt includes complete
  source inputs without corpus or profile context"): keep the no-corpus/
  no-profile assertion; add that with an enabled `DomainExpertise` fixture the
  prompt contains `DOMAIN CONTEXT` and the topic name, and without one
  contains "No domain settings are enabled."
- `tests/writingPipeline.test.ts`: `buildRewritePrompt` with an approved plan
  and enabled domain contains "Concept recognition".
- `README.md` line 57 (Planning API): add optional `domainExpertise`.
- `ARCHITECTURE.md` server routes: `/api/plan-draft` accepts
  `domainExpertise`; outside the staleness fingerprint, and why. The
  invariant "Planning and review never see the voice corpus or blueprint" is
  unchanged and still true.

---

## 5. Todo 3 — Brief caveats bound claims; they are not sentences

### 5.1 Writer (`src/writingPipeline.ts`, `plannedWritingGuidance` second paragraph)

After "The brief may clarify approved ideas but must not replace the draft's
narrative or introduce unrelated detail." add:

> Where the brief limits what the record establishes — for example that an
> artifact was a designed direction rather than a shipped screen, or that a
> hierarchy is the author's interpretation — that limit bounds the strength
> of your claims. It is not a sentence to add. Add a qualification to the
> prose only when the draft states it or an approved decision or limit
> requires it.

### 5.2 Reviewer (`buildReviewPrompt`, `src/writingPipeline.ts` ~750)

In the reviewer's addition/claim instructions add: "A sentence whose only
source is the brief's own caveat about the record (a statement about what is
or is not established) is an addition; report it under `editorial` with the
brief quotation as evidence." Confirm the category enum contains `editorial`
(the last review used it).

### 5.3 Tests

`tests/writingPipeline.test.ts`: `buildRewritePrompt` with a plan contains
"It is not a sentence to add."; `buildReviewPrompt` contains "brief's own
caveat".

---

## 6. Todo 4 — Pin the user's directive during feedback learning

- `server.ts` ~1620: after `...parsed.updatedProfile,` add
  `name: profile.name,` and `customDirectives: profile.customDirectives,`.
  Remove `customDirectives: { type: Type.STRING }` from the `updatedProfile`
  schema properties (~1605).
- `src/utils/voiceFeedback.ts` `persistFeedbackProfile` ~30: add
  `name: profile.name, customDirectives: profile.customDirectives,` to the
  pinned fields.
- `tests/voiceFeedback.test.ts`: new test — an `updatedProfile` with a
  different `customDirectives` and `name` leaves the persisted originals
  intact while `synthesizedGuidelines` updates.
- `README.md` feedback-learning sentence: learning never changes the profile
  name or the user's written directive.

---

## 7. Todo 5 — Docs and repository hygiene

- Apply the README/ARCHITECTURE/DESIGN edits in 3.8, 4.5, 5, 6.
- Two private files sit untracked at the repository root and must not be
  committed: `draftText Tailoring DeepL.txt` (workspace export with private
  case material) and `.xdp-Unconfirmed 128794.crdownload-UPbBRW` (browser
  partial download). Add `*.crdownload*` to `.gitignore`. Ask Mason before
  moving or deleting the export; recommend moving it into
  `evaluation-artifacts/` (already untracked, his).

---

## 8. Verification

Order: Todo 1 → lint/test → Todo 2 → lint/test → Todo 3 → Todo 4 →
lint/test → Todo 5. Commands: `npm run lint` (tsc), `npm test`. Baseline from
the earlier session: 225 tests passing; re-run to confirm before changing
anything.

Rendered check (Todo 1 only): start the dev server on a private port (read
the README section *Development while the app is in use* first; the earlier
session used 3100), load a v4 fixture plan into `localStorage` under the
studio workspace key, open Studio, confirm sections render as disclosure
groups with rows inside, counts are correct, hover highlights the right
paragraphs, and Accept/Reject/Ignore still work. Stop the private server
afterwards. Do not touch port 3000.

Prompt changes (3.3, 4.3, 4.4, 5.1, 5.2) are unverified until Mason regenerates
suggestions and a rewrite on the DeepL draft and judges them. That costs model
calls on his keys and is his decision; after the code lands, offer to run one
planning pass and report the item count, how many carry limits, and the
`openingJob` text against the draft's actual opening.

## 9. Not in scope (report only)

From the transcript, still open, not regressions: `app.listen(PORT, '0.0.0.0')`;
no private-range block in `/api/fetch-link` and `/api/discover-portfolio`;
discover-portfolio prompt says "Extract or formulate"; the default custom
lock "Keep all core metrics…" duplicates the typed locks; the writer's "plain
prose, no markdown" instruction contradicts preserved Markdown headings
(harmless now that Studio renders rich text). Voice recognisability of the
last rewrite against Mason's five samples was not measured; the
blueprint→writer link (8 metrics + directive) is intentional and documented.

## 10. Todos

| id | title | depends on |
|----|-------|------------|
| plan-v4-contract | Version 4 types, validators, schema, generation check (3.1, 3.2) | — |
| plan-v4-prompt | Planner prompt: per-passage items, required limits, grounded openingJob (3.3) | plan-v4-contract |
| plan-v4-writer-block | `editorialPlanBlock` accepts v4; limit sentence in guidance (3.4) | plan-v4-contract |
| plan-v4-grouping | `sectionPlan` section groups + item naming (3.5) | plan-v4-contract |
| plan-v4-ui | `EditorialDecisions` / `SavedEditorialDecisions` disclosure groups, CSS (3.6) | plan-v4-grouping |
| plan-v4-tests | Tests in 3.7 | plan-v4-prompt, plan-v4-writer-block, plan-v4-grouping |
| domain-planner | Client body, server whitelist + normalise, prompt block (4.1–4.3) | — |
| domain-writer-rule | `CONCEPT_RECOGNITION_RULE` constant in planned guidance (4.4) | — |
| brief-caveat-rule | Writer and reviewer sentences + tests (5) | — |
| pin-directive | Server and client feedback merge pins + test (6) | — |
| docs-and-hygiene | README/ARCHITECTURE/DESIGN, `.gitignore` (7) | all above |
| verify | lint, tests, rendered check on private port (8) | all above |

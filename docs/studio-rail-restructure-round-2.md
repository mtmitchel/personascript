# Studio rail restructure — round 2

Written 2026-09-12 against the uncommitted working tree after Part A of
`docs/studio-rail-restructure-plan.md` was implemented and QA'd (277 tests
passing). Implementation plan for a cheaper agent; QA by the planning agent.
Read `AGENTS.md` first, then Part A's §0–§2 for the vocabulary, then this file
in full. This file **supersedes Part B (§4) of the Part A plan**; do not
implement §4.

## 0. Mason's rendered verdict on Part A, and what it decides

| Verdict | Decision in this round |
|---|---|
| "Why aren't Instructions and Rewrite settings simply combined?" | They become one flat form — no disclosure, no `Change`/`Hide` toggle. |
| "Your standing preferences are included. Edit in Draft & Brief" — "You shouldn't actively show anything that would need to pull the user away from their current spot in the workflow … vague references are terrible UX." | The sentence is deleted. The **Standing preferences** field itself is shown in Studio, editable — the same state Draft & Brief edits, with the same limit. |
| "Rewrite settings/instructions/standing preferences DO NOT belong in the same tab as Suggested changes. Massive cognitive overload." | Every author input leaves the Suggestions tab into its own rail tab, **Rewrite settings**. The Suggestions tab holds only the suggestions, the request form, and the footer. |
| "In review section, why is Ask for a change the only action? Wouldn't ignore make sense too?" | Each possible issue gets **Ignore** with **Undo**. Ignoring is saved with the version and removes the issue from the count. |
| "P2: just add a refresh/regenerate icon next to suggested changes." | **Get new suggestions** becomes an icon-only button (lucide `RefreshCw`) in the list header. When no set exists, the empty state carries a **Get suggestions** button. |
| "P11: rename to Possible issues." | Tab label **Possible issues**, with ` (n)` while `n > 0`. No merge. |
| QA deviation from Part A | The *Suggested changes* section renders only when a draft exists. |

Reversed from earlier rounds, deliberately: Round 2 (`anti-pattern-remediation-plan.md` P5) removed **Mark reviewed** as a reading marker. **Ignore** is not a reading marker: it is the author's answer to a proposal, parallel to **Decline** on a suggestion, it changes the count the product shows, and it is persisted. The `.review-issue.is-checked` style left over from that removal is reused.

## 1. Product decisions

Mason may veto any of these; each is reversible.

- **P1. Four rail tabs, in workflow order:** **Suggestions** · **Rewrite
  settings** · **Ask for a change** · **Possible issues (n)**. *Rewrite
  settings* is always enabled (settings can be set before a draft exists).
  The two after-rewrite tabs stay disabled until a version exists, as now.
  Tabs never change the document view.
- **P2. The Rewrite settings tab is a flat form**, top to bottom: voice
  blueprint warning (only when stale, as now) · **Instructions for the
  suggestions and the rewrite (optional)** · **How much should change?** ·
  **Keep unchanged** · **Specific text to keep unchanged (optional)** ·
  **Standing preferences (optional)**. No disclosure, no reveal button, no
  footer. Every change saves on input, as today.
- **P3. Fields that make the suggestions stale say so** in a helper line
  under the field: "Changing this means getting suggestions again before
  rewriting." Applies to *Instructions* and *Standing preferences*
  (`planStaleReasons` covers both); not to strength or locks (rewrite only).
- **P4. Standing preferences is one field shown in two places.** Studio and
  Draft & Brief both bind `editorialPreferences` / `setEditorialPreferences`
  and enforce `EDITORIAL_PREFERENCES_MAX_CHARS` with the same error line.
  Studio's helper: "Used for every draft, not just this one." No link to
  Draft & Brief.
- **P5. Get new suggestions is an icon.** In the list header, an icon-only
  button (`RefreshCw`, 15px) with `aria-label` and `title` **Get new
  suggestions**, rendered only when a set exists. Its consequence dialog is
  unchanged. Without a set, the header has no icon; the empty state ends with
  a `studio-secondary` button **Get suggestions**. Two controls, two stable
  labels.
- **P6. Possible issues can be ignored.** Each issue's actions are **Ask for
  a change** and **Ignore**. An ignored issue collapses to one line — its
  label, **Ignored**, and **Undo** — and stays in place. Ignored issues are
  excluded from the tab count, the panel's status line, and
  `reviewNeedsAttention`. Ignoring is stored on the saved version as
  `review.ignoredFindings?: string[]` (finding keys), an optional field, so
  every stored shape stays readable. Editing the text already discards the
  review (and with it the ignores), which is correct: the review described
  the old text.
- **P7. Tab label for the after-rewrite findings:** **Possible issues** and
  ` (n)` while `n > 0`. The `Review · failed` variant is dropped; the panel's
  first line says the review failed, and the tab still auto-opens on arrival
  in that case.

## 2. Implementation — file by file

Do §2.1–§2.7 in order; `npm run lint && npm test` after each file.
Line numbers are from the current tree; re-find by id or string if they move.

### 2.1 `src/components/StudioDraftControls.tsx` → the Rewrite settings form

Rewrite the component body (keep the export name and file to avoid churn).
Pull `customDirectives`, `setCustomDirectives`, `editorialPreferences`,
`setEditorialPreferences` from `useWritingAssistant()`; import
`EDITORIAL_PREFERENCES_MAX_CHARS` from `../writingPipeline`. Delete the
`addingLock` state, the `summary` string, `strengthLabel`, `protectedLabels`,
the `<details>`/`<summary>`, the **Protect specific text** button, and the
"Your standing preferences are included. Edit in Draft & Brief" paragraph.

Render (keep the existing `disabled` prop on the `<fieldset>`; keep the voice
blueprint notice at the top unchanged):

```tsx
<fieldset disabled={disabled} className="studio-settings-fields">
  <legend className="sr-only">Rewrite settings</legend>

  <div className="studio-field">
    <label htmlFor="input-rewrite-instructions" className="studio-field-label">Instructions for the suggestions and the rewrite (optional)</label>
    <textarea id="input-rewrite-instructions" rows={3} value={customDirectives}
      onChange={e => setCustomDirectives(e.target.value)}
      placeholder="For example, keep it under 500 words." />
    <p className="studio-field-note">Changing this means getting suggestions again before rewriting.</p>
  </div>

  {/* How much should change? — existing select, unchanged */}
  {/* Keep unchanged — existing checkbox group, unchanged */}

  <div className="studio-field">
    <label htmlFor={`${id}-locks`} className="studio-field-label">Specific text to keep unchanged (optional)</label>
    <textarea id={`${id}-locks`} rows={2} className="studio-locks" value={preservationLocks}
      onChange={e => setPreservationLocks(e.target.value)}
      placeholder="For example, the title, or a sentence that must stay word for word." />
  </div>

  <div className="studio-field">
    <label htmlFor="input-studio-standing-preferences" className="studio-field-label">Standing preferences (optional)</label>
    <textarea id="input-studio-standing-preferences" rows={4} value={editorialPreferences}
      onChange={e => setEditorialPreferences(e.target.value)}
      aria-invalid={editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS}
      aria-describedby="studio-standing-preferences-note" />
    <p id="studio-standing-preferences-note" className="studio-field-note">Used for every draft, not just this one. Changing this means getting suggestions again before rewriting.</p>
    {editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS && (
      <p className="studio-inline-notice" role="alert">Standing preferences exceed the {EDITORIAL_PREFERENCES_MAX_CHARS.toLocaleString()} character limit.</p>
    )}
  </div>
</fieldset>
```

Move the "Anything else to protect?" textarea's existing `className="studio-locks"`
across; the `min-height: 60px` rule stays. Remove the `.studio-settings-fields textarea { min-height: 90px }`
floor only if it makes the 2-row locks field taller than 60px — check in the
browser; otherwise leave CSS alone. Update the file's doc comment (L5–11) to
describe the tab, not a disclosure.

### 2.2 `src/components/StudioView.tsx`

**a. Tabs.** `type RailTab = 'suggestions' | 'settings' | 'change' | 'review'`
(L26). Tabs array (L129): `hasRewrite ? ['suggestions', 'settings', 'change', 'review'] : ['suggestions', 'settings']`.
`handleSelectRailTab` (L123) keeps guarding only `change`/`review`. Insert a
tab button after `#rail-tab-suggestions` (L551–560), copying its attributes
with `id="rail-tab-settings"`, `aria-controls="rail-panel-settings"`, label
**Rewrite settings**, never `aria-disabled`. Change `#rail-tab-review`'s
label expression (L584–589) to:
`attentionCount > 0 ? \`Possible issues (${attentionCount})\` : 'Possible issues'`.

**b. Settings panel.** After `#rail-panel-suggestions` closes (before
`#rail-panel-change`, L729), add:

```tsx
<div id="rail-panel-settings" role="tabpanel" aria-labelledby="rail-tab-settings" hidden={railTab !== 'settings'} className="studio-work-content">
  <div className="studio-inspector-scroll">
    <StudioDraftControls disabled={busy} />
  </div>
</div>
```

**c. Suggestions panel.** Delete the whole `{hasDraft && (<div className="studio-rail-inputs">…)}`
block (L603–627). Wrap `<section className="studio-suggestions">` (L657) in
`{hasDraft && (…)}`. Replace the header actions and the list body:

```tsx
<div className="studio-suggestions-actions">
  {plan && !plan.approved && pending > 0 && (
    <button type="button" className="studio-text-button" onClick={acceptAllPending}>Accept the rest</button>
  )}
  {plan && (
    <button id="btn-get-suggestions" type="button" className="studio-icon-button"
      disabled={busy} onClick={handleGetSuggestions}
      aria-label={isPlanning ? 'Getting suggestions…' : 'Get new suggestions'}
      title="Get new suggestions">
      {isPlanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
    </button>
  )}
</div>
…
<p className="studio-suggestions-source">{provenanceLine}</p>
{plan ? <EditorialDecisions /> : (
  <button id="btn-get-suggestions" type="button" className="studio-secondary" disabled={busy}
    onClick={handleGetSuggestions}>
    {isPlanning && <Loader2 size={15} className="animate-spin" />}
    {isPlanning ? 'Getting suggestions…' : 'Get suggestions'}
  </button>
)}
```

Add `RefreshCw` to the lucide import (L18). `setCustomDirectives` and
`customDirectives` may now be unused in this file — remove them from the
destructure if `tsc` or a search confirms.

**d. Ignore wiring.** Pull `setReviewFindingIgnored` from the context (2.4)
and pass `onIgnore={setReviewFindingIgnored}` to `WritingReviewPanel`
(L757–770).

### 2.3 `src/utils/reviewEvidence.ts`

- Export `findingKey` (L78).
- `actionableReviewIssueCount` (L102–109): accept
  `Pick<WritingReview, 'findings' | 'ignoredFindings'>` and filter
  `!(review.ignoredFindings || []).includes(findingKey(finding))` before
  dedupe.
- Add `export function isFindingIgnored(review: Pick<WritingReview, 'ignoredFindings'>, finding: ReviewFinding): boolean`.

### 2.4 `src/types.ts` and `src/context/WritingAssistantContext.tsx`

- `WritingReview` (L268–277): add `ignoredFindings?: string[];` with a
  comment: finding keys the author chose to ignore; optional so saved
  versions stay readable.
- Context interface (near L78): `setReviewFindingIgnored: (finding: ReviewFinding, ignored: boolean) => void;`.
  Implementation next to `updateRewrittenText` (L805), same lock guard:

```ts
const setReviewFindingIgnored = (finding: ReviewFinding, ignored: boolean) => {
  if (writingOperationLock.current || feedbackSaveLock.current) return;
  setRewriteResult((current) => {
    if (!current?.review) return current;
    const key = findingKey(finding);
    const existing = current.review.ignoredFindings || [];
    const next = ignored ? (existing.includes(key) ? existing : [...existing, key]) : existing.filter((k) => k !== key);
    if (next.length === existing.length && ignored === existing.includes(key)) return current;
    return { ...current, review: { ...current.review, ignoredFindings: next.length ? next : undefined } };
  });
};
```

  Add it to the provider value (L1237 area). It rides the existing workspace
  save and the existing history sync on version switch; no storage key or
  normaliser change.

### 2.5 `src/components/WritingReviewPanel.tsx`

- New prop `onIgnore?: (finding: ReviewFinding, ignored: boolean) => void`.
- `actions` (L93) takes the finding too. Render:
  `Ask for a change` (as now) then, when `onIgnore`, `<button type="button" onClick={() => onIgnore(finding, true)}>Ignore</button>`.
- In the findings map (L135–143): if `isFindingIgnored(review, finding)`,
  render instead
  `<article className="review-issue is-checked"><p><span className="font-semibold">{findingLabels[finding.category]}</span> · Ignored <button type="button" className="underline ml-2" onClick={() => onIgnore?.(finding, false)}>Undo</button></p></article>`.
- `actionableCount` (L91) already reflects ignores via 2.3; the status line
  (L123–129) needs no change. When every issue is ignored the line reads "No
  issues flagged…" — change that branch's text to
  `'No open issues. Give the draft a final read.'` so it is true in both
  cases.

### 2.6 `src/index.css`

- Delete `.studio-rail-inputs` (L252) and the settings-summary rules
  (L260–263: `.studio-settings > summary…`, `.studio-inspector details.studio-settings…`).
- Add `.studio-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--color-neutral-700); }`
  and `.studio-icon-button:hover:not(:disabled) { background: var(--color-neutral-100); color: var(--color-neutral-900); }`.
  Focus outline comes from the global rule.
- `.studio-settings-fields` (L186): keep; it is now the tab's form container.
  Add `.studio-settings-fields .studio-field-note { margin: 0; }` if the note
  otherwise inherits a margin.

### 2.7 Documentation owners

- `README.md` L53 *Review suggested edits*: the icon button; the empty-state
  button; no inputs on the Suggestions tab.
- `README.md` L55 *Writing settings*: rewrite as the **Rewrite settings**
  tab; list its six fields; standing preferences are the same field as Draft
  & Brief's and are editable in both; the "Studio notes when they are
  included" sentence goes.
- `README.md` L67–69: **Possible issues** tab; **Ignore** / **Undo**;
  ignored issues leave the count and are saved with the version.
- `DESIGN.md` *Studio controls*: four tabs; `.studio-icon-button`.
- `ARCHITECTURE.md`: `WritingReview.ignoredFindings` optional field; the rail
  tab list if it is named there.

## 3. Tests

Record the count before starting (expect 277).

Update:
- `tests/studioView.test.ts` L64–66, L94–95: add `rail-tab-settings` present
  and never `aria-disabled`; `rail-tab-review` label `Possible issues`.
  L103, L178: `#btn-get-suggestions` with a plan is an icon button — assert
  `aria-label="Get new suggestions"` instead of text. L117
  `#input-rewrite-instructions` now lives inside `#rail-panel-settings`;
  assert it is absent from `#rail-panel-suggestions`. L234: `Rewrite settings`
  still appears (tab label); drop the `keeps` assertion.

Add:
- Settings tab renders `input-studio-standing-preferences` bound to the
  fixture's `editorialPreferences` value, and `Used for every draft`.
- No draft: `Suggested changes` does not render.
- `tests/reviewEvidence.test.ts` (or nearest existing): a review with two
  findings and `ignoredFindings: [findingKey(first)]` counts 1; `isFindingIgnored`
  true/false.
- `studioView`: fixture version whose review has one finding → tab label
  `Possible issues (1)`; same fixture with that finding ignored → label
  `Possible issues`, panel contains `Ignored` and `Undo`.
- Storage: a saved version without `ignoredFindings` still loads (extend an
  existing workspace-load test).

## 4. Browser verification (implementer runs; planner repeats)

Private server on port 3100, `DISABLE_HMR=true`, `window.fetch` mocked before
anything that could call `/api/plan-draft` or `/api/rewrite*`. Never touch
port 3000.

| # | State | Check |
|---|---|---|
| Q1 | Draft, no set | Four tabs; *Rewrite settings* enabled, the two after-rewrite tabs disabled. Suggestions tab: header **Suggested changes** with no icon; explanatory line; **Get suggestions** button; footer status above disabled **Rewrite**. No input fields on this tab. |
| Q2 | Rewrite settings tab | Flat form in the order of P2; no `+`/`−`, no **Change/Hide**, no "Edit in Draft & Brief". Type in *Standing preferences*; open Draft & Brief; the same text is there. Return; it persists. |
| Q3 | Same | Type in *Instructions*; return to Suggestions with an existing set; footer reads "Your rewrite instructions changed after these suggestions were prepared…". |
| Q4 | Editable set | Header shows **Accept the rest** and the refresh icon; hovering the icon shows the tooltip **Get new suggestions**; clicking with answers opens **Replace these suggestions?**. |
| Q5 | No draft | Rail shows tabs and footer status "Add your draft…" only; no **Suggested changes** header. |
| Q6 | Version with 2 issues | Tab reads **Possible issues (2)**; each issue has **Ask for a change** and **Ignore**. |
| Q7 | Same | Click **Ignore** on one: it collapses to "{label} · Ignored · Undo"; tab reads **Possible issues (1)**; status line says 1 possible issue. Reload the page: still ignored. **Undo** restores it and the count. |
| Q8 | Same, ignore both | Tab reads **Possible issues**; status "No open issues. Give the draft a final read." |
| Q9 | Keyboard | Arrow keys move through all four tabs when a version exists, two when not; focus follows. |

## 5. Out of scope

Do not: change prompts, `server.ts`, `editorialPlan.ts`, `editorialSummary.ts`,
`writingPipeline.ts`, storage keys, or the document pane; merge tabs; add a
footer to the settings tab; touch Draft & Brief except as §2.7 documents;
commit, push, stash, reset, or create or modify worktrees; touch port 3000.

## 6. Implementer's report

Files changed; Q1–Q9 each pass / fail / not run with how observed; test
counts before and after; every place this plan's line numbers or claims were
wrong with what you found instead; anything skipped and why. Leave changes
uncommitted.

## 7. Handoff message

```
Implement docs/studio-rail-restructure-round-2.md in
/home/mason/Projects/persona script (note the space; quote the path). Repo
mtmitchel/personascript, branch main, uncommitted tree on top of 731e1b3 with
Part A of docs/studio-rail-restructure-plan.md already applied. Read
AGENTS.md, then §0–§2 of the Part A plan for vocabulary, then the round-2
file in full. Do NOT implement §4 (Part B) of the Part A plan; round 2
supersedes it.

Verify live state first: git status --short (many modified and untracked
paths exist — touch only files the plan names; never stage, revert, or
normalise anything else), git log --oneline -3, npm run lint && npm test
(expect 277 passing; record the number).

Do §2.1–§2.7 in order, then §3. Decisions in §1 are final — implement them,
do not add alternatives. §5 lists what you must not touch. After each file:
npm run lint && npm test; update tests that assert renamed strings, never
weaken or delete an assertion without replacing it. Then npm run build.

UI copy: sentence case, plain English for the author; no internal
vocabulary (plan, decision, passage, anchor, finding key). Button labels are
stable; unavailability is disabled + a reason line. No Prettier; do not
reformat files.

Browser checks §4 Q1–Q9 on your own server on port 3100 with
DISABLE_HMR=true (restart after every source/CSS change; find pids via
/proc/*/environ containing PORT=3100; kill by numeric pid only). Mock
window.fetch in-page before anything that could call /api/plan-draft or
/api/rewrite* — real model calls cost the owner money. If you cannot open a
browser, say so; do not describe static markup as rendered.

Report per §6. Leave all changes uncommitted.
```

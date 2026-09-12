# Studio rail restructure plan — Suggestions tab order, naming, and tab merge

> **Status.** Part A (§3) is implemented and QA'd. Part B (§4, the tab merge)
> is **superseded and must not be implemented**: Mason vetoed the merge and
> P2/P11. The follow-on work is `docs/studio-rail-restructure-round-2.md`.

Written 2026-09-12 against the uncommitted working tree on top of `731e1b3`
(the tree contains the Round-1 and Round-2 Studio changes from
`docs/studio-mitigation-plan.md`, `docs/anti-pattern-remediation-plan.md`, and
`docs/anti-pattern-remediation-fixes.md`). Implementation plan for a cheaper
agent; QA by the planning agent. Read `AGENTS.md` first.

This plan takes up items deferred by the two earlier plans — "rail density,
control sizing, and visual hierarchy" and "two task modes" — now that Mason
has named the elements from a rendered screen. It is in two parts. **Part A**
(§3) restructures the Suggestions tab and is done first. **Part B** (§4)
merges the *Review* tab into *Ask for a change* and is done only after Part A
has been reported and Mason has looked at it.

## 0. The screen's job and its objects

The right rail has one job before a rewrite and another after it.

- **Before rewriting** (Suggestions tab): decide which of the model's proposed
  changes the next rewrite should follow, add your own requests, set how much
  should change and what must not, then run the rewrite. Done when a new
  version arrives.
- **After rewriting** (Ask for a change and Review tabs): read what the
  reviewer flagged in the open version and ask for changes to it. Done when the
  author is satisfied with the version or starts another one.

Objects the author acts on, in plain words used on screen:

| Object | What it is | Where it comes from |
|---|---|---|
| **Suggestion** | one proposed change to one section or passage of the draft: what changes and why | the Review & analysis model, from the draft, brief, reader and purpose, and the author's instructions (`/api/plan-draft`) |
| **Request** | the author's own instruction about a selected passage of the draft, for the next rewrite | the author |
| **Instructions** | free text that both the suggestions and the rewrite follow (`customDirectives`) | the author |
| **Rewrite settings** | how much should change (`rewriteIntensity`) and what stays unchanged (preservation locks) | the author; rewrite only, not suggestions |
| **Possible issue** | one thing the reviewer flagged in the open version | the reviewer model after a rewrite |
| **Edit** | the author's instruction to change the open version | the author |

The word **plan** is internal and never appears on screen.

## 1. Defects (verified in source and against Mason's screenshots)

| # | Defect | Evidence |
|---|---|---|
| D1 | The action bar (**Rewrite**, **Get suggestions**, status) is pinned at the *top* of the Suggestions tab, above the instructions, settings, and every suggestion it depends on. The author must scroll down to read what the button will act on and scroll back up to act. The other tab already puts its primary action (**Apply edit**) *after* the composer, so the two tabs disagree. | `StudioView.tsx` L586–629 (`.studio-rail-actions` before `.studio-inspector-scroll` at L631); `RewriteFeedbackManager.tsx` L140–156; `index.css` L238 (`border-bottom`) |
| D2 | **Rewrite** and **Get suggestions** are drawn as a pair. They are not alternatives: **Get suggestions** produces the list, **Rewrite** consumes it. Before a plan exists the enabled action is the secondary button and the disabled action is the primary. After a plan exists the label **Get suggestions** is false — suggestions are already there and the button *replaces* them (and discards answers, which is why `ConfirmDialog` exists). | `StudioView.tsx` L588–609; L307–313 (`handleGetSuggestions` → `confirmReplace`) |
| D3 | The list of suggestions has no heading and no provenance. Nothing on screen says what a suggestion is or where it came from. `editorialPlan.modelUsed` is stored and never shown. | `StudioView.tsx` L686–690 renders `<EditorialDecisions />` with no heading; `types.ts` L212 |
| D4 | "These are the suggestions the last rewrite followed." is a boxed `.studio-notice` placed between the settings disclosure and **Opening**. It is a *state of the list*, rendered as if it were a warning about something else. | `EditorialDecisions.tsx` L180–182 |
| D5 | The rewrite settings render as a `<details>` whose summary is a 12px grey line ("Thorough rewrite · protecting numbers, …  +"). It has no label, looks like a status line, and sits between an input field and the suggestions with the same visual weight as both. | `StudioDraftControls.tsx` L29, L39–40; `index.css` L252 |
| D6 | **Opening** is a section-style uppercase heading over one sentence, in the same style as the draft-section headings below it. It looks like a suggestion without controls. It is `plan.openingJob`: one sentence saying what the rewrite's opening must establish, which the writer follows and the author cannot answer. | `EditorialDecisions.tsx` L246–249; `editorialPlan.ts` L282 |
| D7 | "7 of 7 suggestions answered" counts Accept/Decline clicks. After a rewrite every unanswered suggestion has been accepted by approval, so the count reads as something the author did not do. In the editable state it duplicates the footer status ("n unanswered suggestions will be accepted when you rewrite."). | `EditorialDecisions.tsx` L255–264; `studioStatus.ts` L120–128 |
| D8 | The first suggestion in every section repeats the section heading: `sectionPlan` names a suggestion that opens its section by the section name, and `renderSuggestion` prints `section.name — idea` directly under a `<summary>` that already prints the same name. The second whole-section suggestion prints `Section — “quote”`, repeating it again. | `editorialSummary.ts` L129–137; `EditorialDecisions.tsx` L103–107, L118–121; same in `SavedEditorialDecisions` L309–313 |
| D9 | Suggestion rows are indistinguishable from one another: 4px gap between rows, 2px gap inside a row, no rule, and the row's lead line is the repeated heading at body weight. The only two visual levels are the uppercase section summary and body text. | `index.css` L137, L141–144 |
| D10 | **Review (4)** names the author's activity, not an object; the author is also reviewing on the Suggestions tab and in *Changes*. Its contents are the reviewer's *possible issues* with the open version, and every issue's only action is **Ask for a change**, which switches to the other tab. *Review* and *Ask for a change* are about the same object (the open version) and are separated; *Suggestions* is about a different object (the next rewrite) and must stay separate. | `StudioView.tsx` L559–576, L149–153 (`requestCorrection` sets `railTab('change')`); `WritingReviewPanel.tsx` L93–95 |
| D11 | Label "Anything the suggestions and the writer should take into account? (optional)" is a question about two agents; the author does not know who "the writer" is. | `StudioView.tsx` L634–636 |
| D12 | Footer status "Rewrite makes another version from these suggestions." uses "these" while the suggestions are in another scroll position. | `studioStatus.ts` L115 |

## 2. Product decisions taken in this plan

Mason may veto any of these; each is reversible and marked with what changes if vetoed.

- **P1. The Suggestions tab's primary action moves to a pinned footer.** Order
  inside the footer, top to bottom: the status line (the reason the action is
  or is not available), then **Rewrite** (primary, stable label, `disabled` +
  reason when unavailable — `AGENTS.md`). The footer is the only place the
  primary action appears. Information precedes the action it governs; the
  footer stays pinned so the control cannot scroll out of reach (`DESIGN.md`,
  *Scroll containment*).
- **P2. Get suggestions leaves the footer and joins the list it produces.** It
  becomes the action in the header row of the *Suggested changes* list. Its
  label names its consequence: **Get suggestions** when there is no suggestion
  set, **Get new suggestions** when one exists (it replaces the set; the
  existing `ConfirmDialog` still guards answers and requests). This is two
  consequences with two labels, the same principle as consequence-naming
  dialog buttons; it is not an availability change relabelled, which is what
  the `AGENTS.md` stable-label rule forbids. *If vetoed:* one label, **Get
  suggestions**, in both states; the header line beside it must then say that
  getting suggestions replaces the current set.
- **P3. The list gets a heading and a provenance line.** Heading **Suggested
  changes** (the name `README.md` and `DESIGN.md` already use). Under it, one
  line saying who made them and from what, and the list's state:
  - no set: "The review model reads your draft, brief, reader and purpose,
    and your instructions, then suggests what each section should keep,
    shorten, or cut. Answer the ones you disagree with; the rest are used
    when you rewrite."
  - set, editable: "Prepared by {model} from your draft, brief, reader and
    purpose, and instructions." ({model} = `modelDisplayName(modelUsed)`;
    omit "by {model}" when `modelUsed` is missing.)
  - set, approved (after a rewrite): "Prepared by {model}. The last rewrite
    followed them." — this replaces the boxed notice (D4).
  Stale and skipped-paragraph warnings stay as notices and sit directly under
  this line.
- **P4. "Opening" is relabelled and demoted to guidance.** Label **What the
  opening must establish**, in the field-label style, followed by the sentence
  in body style. It is not a section, not a suggestion, and has no controls.
  Position unchanged (after requests, before the sections).
- **P5. The answered count goes; "Accept the rest" moves to the list header.**
  The footer status already states the consequence ("n unanswered suggestions
  will be accepted when you rewrite."). **Accept the rest** appears in the
  header row beside **Get new suggestions** only while the set is editable and
  has unanswered suggestions.
- **P6. A suggestion is not named by its section.** A suggestion that covers
  the start of its section carries no name of its own — the section summary
  above it is its name. A suggestion that starts inside its section is named
  by its quotation, as now. This removes every repeated heading (D8) in both
  the editable and the saved list.
- **P7. Rows are separated by hairline rules, not cards.** `DESIGN.md` prefers
  a hairline rule over a gap and a gap over a container, and forbids nesting
  containers. Rows get a top hairline between neighbours and more vertical
  padding, and the lead line becomes the suggestion's own sentence (what
  changes). *If vetoed in favour of cards:* each row becomes a `#FFFFFF` card
  with a `#E5E5E5` hairline border and 8px radius on a `#FAFAFA` list ground —
  and `DESIGN.md` §4 *Cards and containers* and the *Suggestions read as an
  editor's note* paragraph must be rewritten to allow it.
- **P8. The settings become a labelled field with an edit affordance.** Label
  **Rewrite settings**; value line (current strength and what is kept
  unchanged); the disclosure toggle reads **Change** when closed and **Hide**
  when open, instead of `+`/`−`. The instructions field and the settings field
  form one group above the list, separated from the list by a hairline rule.
  Order: instructions first (they change the suggestions *and* the rewrite),
  settings second (rewrite only).
- **P9. Instructions label.** "Anything the suggestions and the writer should
  take into account? (optional)" becomes **Instructions for the suggestions
  and the rewrite (optional)**. Placeholder unchanged.
- **P10. Footer status copy** names position, not "these": "Rewrite makes
  another version that follows the suggestions above." and "Get suggestions
  above first. The rewrite follows the ones you accept."
- **P11. (Part B) Merge *Review* into *Ask for a change*.** Two rail tabs:
  **Suggestions** (next rewrite) and **Ask for a change** (open version). The
  merged tab holds the composer at the top and, under it, the reviewer's
  **Possible issues** for the open version; **Apply edit** sits in a pinned
  footer with its status line, matching Part A. Choosing **Ask for a change**
  on an issue fills the composer and focuses it (no tab switch). The tab
  label carries no count: "(4)" numbered issues, not changes, and a number on
  a verb label is ambiguous; the panel's first line and the auto-open after a
  rewrite carry the signal. *If vetoed:* keep three tabs and rename **Review
  (4)** to **Possible issues (4)** — an object, not an activity — leaving
  everything else in Part B undone.

Rejected: combining *Suggestions* with *Review*. They concern different
objects at different times (the draft before, the version after); a merged tab
would put answerable proposals and unanswerable findings in one list.

## 3. Part A — Suggestions tab

Do §3.1–§3.6 in order; run `npm run lint && npm test` after each file.

### 3.1 `src/components/StudioView.tsx`

**a. Move the action bar to a footer (P1).** Inside `#rail-panel-suggestions`
(L580–710), the panel's children are currently `.studio-rail-actions` (L586)
then `.studio-inspector-scroll` (L631). Reorder to `.studio-inspector-scroll` then
`.studio-rail-actions`. Inside `.studio-rail-actions`, put the status `<p>`
(and its `<details className="studio-status-detail">`) **before** the
`<div>` holding the button. The `<div>` now holds only `#btn-rewrite`.
Remove `#btn-get-suggestions` from here (it moves in b). Keep every existing
attribute and the `statusResult` logic.

**b. List header (P2, P3, P5).** Replace the two blocks at L686–696
(`{plan && (<div className="studio-decisions">…)}` and
`{!plan && hasDraft && (<p className="studio-panel-description">…)}`) with one
block rendered whenever `hasDraft`; the `<ConfirmDialog>` at L698 stays where
it is:

```tsx
<section className="studio-suggestions" aria-labelledby="suggestions-heading">
  <div className="studio-suggestions-header">
    <h2 id="suggestions-heading">Suggested changes</h2>
    <div className="studio-suggestions-actions">
      {plan && !plan.approved && pending > 0 && (
        <button type="button" className="studio-text-button" onClick={acceptAllPending}>Accept the rest</button>
      )}
      <button
        id="btn-get-suggestions"
        type="button"
        disabled={busy || !hasDraft}
        onClick={handleGetSuggestions}
        className="studio-text-button"
      >
        {isPlanning && <Loader2 size={15} className="animate-spin" />}
        {isPlanning ? 'Getting suggestions…' : plan ? 'Get new suggestions' : 'Get suggestions'}
      </button>
    </div>
  </div>
  <p className="studio-suggestions-source">{provenanceLine}</p>
  {plan ? <EditorialDecisions /> : null}
</section>
```

`provenanceLine` (compute above the `return`):

```ts
const planModel = plan?.modelUsed ? modelDisplayName(plan.modelUsed) : '';
const provenanceLine = !plan
  ? 'The review model reads your draft, brief, reader and purpose, and your instructions, then suggests what each section should keep, shorten, or cut. Answer the ones you disagree with; the rest are used when you rewrite.'
  : plan.approved
    ? `Prepared${planModel ? ` by ${planModel}` : ''}. The last rewrite followed them.`
    : `Prepared${planModel ? ` by ${planModel}` : ''} from your draft, brief, reader and purpose, and instructions.`;
```

Import `modelDisplayName` from `../modelChoice`. `acceptAllPending` moves
here from `EditorialDecisions.tsx` (see 3.2); it needs `editEditorialPlan` and
`plan`, both already in scope:

```ts
const acceptAllPending = () => {
  if (!plan) return;
  editEditorialPlan({
    ...plan.plan,
    items: plan.plan.items.map(item => item.decision !== 'keep' && !item.response ? { ...item, response: 'accepted' as const } : item),
  });
};
```

Note `plan.approved` is used for the header, not `planApproved`: a stale
approved set still "was followed by the last rewrite".

**c. Group the two inputs (P8, P9).** Wrap the instructions `.studio-field`
(L632–647) and the `StudioDraftControls` wrapper (L649–653) in
`<div className="studio-rail-inputs">…</div>`; remove their `mb-4` classes
(the container supplies the gap). Change the label text at L635 to
**Instructions for the suggestions and the rewrite (optional)**. The request
form (L655–684) stays where it is, after the inputs and before the list.

### 3.2 `src/components/EditorialDecisions.tsx`

- Delete the `readOnly` notice (L180–182). P3 replaces it.
- Delete the `total > 0` summary block (L255–264) and the `acceptAllPending`
  function (L91–101) and the now-unused `total` / `answered` variables
  (L87–88). Keep `pending` (L89) if still referenced; otherwise delete it
  too. Keep `readOnly` — the rows still use it.
- Opening (L246–249, P4):
  ```tsx
  <div className="studio-note-opening-job">
    <p className="studio-field-label">What the opening must establish</p>
    <p>{compactPlanText(plan.openingJob)}</p>
  </div>
  ```
- Row naming (P6). `renderSuggestion` (L103) receives the group:
  `const renderSuggestion = (section: PlanSection, group: PlanSectionGroup) => …`
  and is called at L162 as `rows.map(section => renderSuggestion(section, group))`.
  Inside, compute the row label:
  ```ts
  const prefix = `${group.name} — `;
  const rowName = section.name === group.name ? '' : section.name.startsWith(prefix) ? section.name.slice(prefix.length) : section.name;
  ```
  Render the first `<p>` (L118–121) as:
  ```tsx
  <p className="studio-note-lead">
    {rowName && <span className="studio-note-name">{rowName}</span>}
    {rowName && section.item.idea.trim() && ' — '}
    {section.item.idea.trim() && compactPlanText(section.item.idea)}
  </p>
  ```
  Apply the identical change in `SavedEditorialDecisions` (L309–313), which
  already has `group` in scope. Do **not** change `sectionPlan` in
  `editorialSummary.ts`: `section.name` is still used by the *Unchanged: …*
  line and by tests.

### 3.3 `src/components/StudioDraftControls.tsx` (P8)

Replace the `<details className="studio-settings"><summary>{summary}</summary>`
opening (L39–40) with:

```tsx
<details className="studio-settings">
  <summary>
    <span className="studio-field-label">Rewrite settings</span>
    <span className="studio-settings-value">{summary}</span>
  </summary>
```

and change `summary` (L29) to read as a value, not a sentence:
`` `${strengthLabel} · ${protectedLabels.length ? `keeps ${protectedLabels.join(', ')}` : 'nothing kept unchanged'}` ``
(for example "Thorough · keeps numbers, direct quotes, section order,
specific text").

### 3.4 `src/utils/studioStatus.ts` (P10)

- L78: `'Get suggestions before rewriting.'` → `'Get suggestions above first. The rewrite follows the ones you accept.'`
- L115: `'Rewrite makes another version from these suggestions.'` → `'Rewrite makes another version that follows the suggestions above.'`

Leave the stale, issue, pending, and ready strings unchanged.

### 3.5 `src/index.css`

Anchor every rule to an existing selector; do not restyle anything else.

- L238 `.studio-rail-actions`: change `border-bottom` to `border-top`. At
  L240 `.studio-edit-actions`, change `border-bottom: none` to
  `border-top: none` so the *Ask for a change* tab is unchanged until Part B.
  Add
  `.studio-rail-actions .studio-rail-status { order: -1; }` only if the DOM
  order from 3.1a is not already status-first (it should be; prefer DOM
  order).
- New:
  ```css
  .studio-rail-inputs { display: grid; gap: 16px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--color-neutral-200); }
  .studio-suggestions { display: grid; gap: 12px; }
  .studio-suggestions-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .studio-suggestions-header h2 { font-size: 14px; font-weight: 600; color: var(--color-neutral-900); }
  .studio-suggestions-actions { display: flex; gap: 14px; align-items: baseline; white-space: nowrap; }
  .studio-suggestions-source { margin: 0; font-size: 12px; line-height: 1.6; color: var(--color-neutral-600); }
  .studio-note-opening-job { display: grid; gap: 4px; }
  .studio-note-opening-job p:last-child { margin: 0; font-size: 13px; line-height: 1.7; color: var(--color-neutral-800); }
  .studio-settings > summary .studio-settings-value { color: var(--color-neutral-700); }
  .studio-settings > summary::after { content: "Change"; margin-left: auto; text-decoration: underline; text-underline-offset: 3px; color: var(--color-neutral-800); }
  .studio-settings[open] > summary::after { content: "Hide"; }
  ```
  The generic `.studio-inspector summary::after { content: " +" }` (L118–119)
  is overridden by the more specific `.studio-settings > summary::after`;
  verify in the browser that `+`/`−` no longer show on the settings summary
  and still show on the section disclosures.
- L252 `.studio-settings > summary`: change `font-size: 12px; color: var(--color-neutral-600);` to `font-size: 13px; color: var(--color-neutral-800);` and add `flex-wrap: wrap;`.
- Rows (P7, D9): L137 `.studio-note-section > ul { gap: 0; }`; L141
  `.studio-note-row`: change `padding: 6px 8px` to `padding: 10px 8px`, add
  `border-top: 1px solid var(--color-neutral-200);` and
  `.studio-note-row:first-child { border-top: none; }`. Add
  `.studio-note-lead { font-size: 14px; line-height: 1.6; color: var(--color-neutral-900); }`.
  Remove nothing else. Delete the now-unused `.studio-note-summary` (L251) and
  `.studio-note-opening` (L127) rules if nothing references them after 3.2
  (`SavedEditorialDecisions` still uses `.studio-note-opening` at L276 and
  L278 — switch the opening line to the same `.studio-note-opening-job`
  markup as 3.2, give the conflict lines a plain `<p>`, and then delete L127).
- Update the two comments at L122–124 and L138–140 so they describe the new
  structure (rows separated by rules; a row is named only by a quotation).

### 3.6 Documentation owners (`AGENTS.md` requires it)

- `README.md` L53 *Review suggested edits*: **Get suggestions** is in the
  header of the **Suggested changes** list (label **Get new suggestions** when
  a set exists); the list shows who prepared it; **Rewrite** is in the rail
  footer under its status line; the opening line is labelled *What the opening
  must establish*; the answered count is gone; unanswered suggestions are
  accepted on rewrite (already stated in the footer status).
- `README.md` L55 *Writing settings*: field label **Rewrite settings** with a
  **Change/Hide** toggle; instructions label text.
- `DESIGN.md` §4 *Studio controls*: `.studio-rail-actions` is the pinned
  **footer** of the Suggestions tab, status line above the single primary
  button; `.studio-suggestions-header` is the list header with its text
  actions.
- `DESIGN.md` *Suggestions read as an editor's note*: rows are separated by
  hairline rules; a row is named only when it is narrower than its section;
  the opening line is a labelled guidance line, not a heading; the count row
  is gone. Remove the words "borders" from "No pills, borders, …" or qualify
  them ("no borders except the hairline between rows").
- `ARCHITECTURE.md`: grep for `Get suggestions`, `Review`, `rail`; update only
  sentences this plan makes false.

## 4. Part B — merge *Review* into *Ask for a change* (P11)

Do not start until Part A is reported and Mason has replied.

### 4.1 `src/components/StudioView.tsx`

- `type RailTab = 'suggestions' | 'change'`. Remove `'review'` everywhere:
  the initial-state expression (L47), the arrival effect (L99), `onTabKeyDown`
  tabs array (L128), `handleSelectRailTab` (L122), and the `#rail-tab-review`
  button and `#rail-panel-review` panel (L559–576, L730–762). Line numbers
  here are pre-Part-A; re-find them by id.
- `#rail-tab-change` label is the constant string **Ask for a change** — no
  count, no "· failed".
- `requestCorrection` (L149–153) no longer calls `setRailTab('change')` — it
  is only ever called from inside that tab now — but keeps `clearSelection()`
  and the `editRequest` update.
- Pass the review into `RewriteFeedbackManager` (new props):
  `review={review}`, `sourceText={rewriteResult.originalText}`,
  `rewrittenText={rewriteResult.rewrittenText}`,
  `onCompareSources={() => { setDocView('changes'); clearSelection(); setDocPanel(null); }}`,
  `onConfigureReviewer={() => openModelSettings('analysis')}`,
  `onRequestEdit={requestCorrection}`.
- `reviewNeedsAttention` is still used to decide the initial `docView`? No —
  it only chose between `'review'` and `'change'`. Delete it and the
  `needsReview` variable if nothing else uses them (`attentionCount` stays
  for the panel).

### 4.2 `src/components/RewriteFeedbackManager.tsx`

- Add the props above (all optional; the component must still render without
  a review).
- Layout inside the `<form>`: `.studio-inspector-scroll` holds, in order: the
  selection block (as now), the composer (as now), the save-rule checkbox and
  voice-save notices (as now), then a new
  `<section className="studio-issues" aria-labelledby="issues-heading">` with
  `<h2 id="issues-heading">Possible issues</h2>` and `<WritingReviewPanel …/>`
  when `review` is present, or `<p className="studio-panel-description">No
  review is saved with this version. Compare it with the original before
  using it.</p>` when it is not.
- Move `.studio-rail-actions.studio-edit-actions` **out of** the scroll region
  to be the form's last child (pinned footer). Inside it, put the status
  `<span role="status">` before the button and make it a `<p className="studio-rail-status">`.
  The `error` paragraph goes inside the footer too, after the status.
- Remove the `.studio-edit-actions` overrides at `index.css` L240–241 so the
  footer matches the Suggestions tab.

### 4.3 `src/components/WritingReviewPanel.tsx`

- No heading of its own is needed now (the section heading is outside). Keep
  the status line as its first child; when `unavailable`, the string stays.
- The button label in `actions()` stays **Ask for a change**. After
  `onRequestEdit`, the parent already focuses `#input-edit-request` via
  `editRequest.sequence`; add `scrollIntoView({ block: 'nearest' })` on the
  textarea in `RewriteFeedbackManager`'s existing `useEffect` (L55–62) so the
  filled composer comes into view.

### 4.4 Documentation owners

- `README.md` L67–69: two rail tabs; possible issues live under the composer
  on **Ask for a change**; no count on the tab.
- `DESIGN.md` *Studio controls*: tab strip is two tabs.
- `ARCHITECTURE.md`: any sentence naming the Review tab.

## 5. Tests

Run `npm test` before touching anything and record the count.

Update, never delete without replacing:

- `tests/studioStatus.test.ts` L56 → `'Get suggestions above first. The rewrite follows the ones you accept.'`; L121 → `'Rewrite makes another version that follows the suggestions above.'`.
- `tests/studioView.test.ts` L70, L103, L178: `#btn-get-suggestions` no longer
  has `studio-secondary`; assert the label is `Get suggestions` when the
  fixture has no plan and `Get new suggestions` when it has one. L109: replace
  the `0 of 2 suggestions answered` assertion with one that the string does
  **not** appear and that `Accept the rest` does. L181: new status string.

Add (Part A):

- Footer order: in the rendered HTML of the Suggestions panel, the index of
  `class="studio-rail-status` is less than the index of `id="btn-rewrite"`,
  and the index of `class="studio-inspector-scroll` is less than the index of
  `class="studio-rail-actions`.
- Header: `Suggested changes` appears once; with a plan whose `modelUsed` is
  set, `Prepared by ` appears; with `approved: true`, `The last rewrite
  followed them.` appears and `These are the suggestions the last rewrite
  followed.` does not.
- Opening: `What the opening must establish` appears; the uppercase heading
  `>Opening<` does not.
- No repeated name: build a fixture whose first item covers paragraphs 1–N
  under a heading; assert the heading text appears exactly once inside the
  `.studio-note-section` markup (once in `<summary>`, not again in the row).
- Settings: `Rewrite settings` appears; the summary text contains `keeps`.

Add (Part B):

- Only two `role="tab"` buttons render; `rail-tab-review` is absent.
- With a review that has one actionable finding, `Possible issues` and the
  finding label render inside `#rail-panel-change`.
- `#btn-apply-changes` is preceded in markup by its status `<p>`.

## 6. Browser verification (implementer runs; planner repeats)

Private server on port 3100 with `DISABLE_HMR=true`; never touch port 3000.
Mock `window.fetch` before anything that would call `/api/plan-draft` or
`/api/rewrite*`. Load `tests/fixtures/studioWorkspace.ts` shapes into
`localStorage` under `STUDIO_WORKSPACE_KEY` to reach each state.

| # | State | Check |
|---|---|---|
| Q1 | Draft, no plan | Rail: inputs group (instructions, Rewrite settings with **Change**), hairline, **Suggested changes** header with **Get suggestions** on the right, explanatory line, no list. Footer pinned at the bottom: status "Get suggestions above first…" above a disabled **Rewrite**. Rail scrolls only in the middle region. |
| Q2 | Draft, editable plan, some unanswered | Header shows **Accept the rest** and **Get new suggestions**; provenance line names the model; no "n of m answered" anywhere; footer status "n unanswered suggestions will be accepted when you rewrite."; **Rewrite** enabled. |
| Q3 | Same | First row in each section shows no repeated heading; rows separated by a hairline; hovering a row still washes its paragraphs amber. |
| Q4 | Same | **What the opening must establish** reads as a labelled line, visually distinct from section summaries (not uppercase). |
| Q5 | Same | Click **Change** on Rewrite settings: fields open, toggle reads **Hide**; section disclosures still show `+`/`−`. |
| Q6 | Approved plan, version open | Provenance line ends "The last rewrite followed them."; no boxed notice; no Accept/Decline controls; footer status "Rewrite makes another version that follows the suggestions above." |
| Q7 | Editable plan with answers | **Get new suggestions** opens the **Replace these suggestions?** dialog; **Keep current suggestions** cancels. |
| Q8 | Keyboard | Tab order in the Suggestions panel: inputs → header actions → rows → footer **Rewrite**. Focus outline visible on the text buttons. |
| Q9 (B) | Version with 2 issues | Two tabs; **Ask for a change** opens after rewrite; composer at top; **Possible issues** below with 2 findings; **Apply edit** footer pinned with status above it. |
| Q10 (B) | Same | Click an issue's **Ask for a change**: composer fills, scrolls into view, is focused; no tab change; status reads "The whole rewrite may change…" or the scoped equivalent. |
| Q11 (B) | Version with failed review | **Possible issues** section shows "The review failed…" line; tab label is still **Ask for a change**. |

## 7. Out of scope for the implementer

Do not: touch `WritingAssistantContext.tsx`, `editorialPlan.ts`,
`editorialSummary.ts`, `writingPipeline.ts`, `server.ts`, prompts, storage
keys, or the document pane; change the five-step IA; add a component library;
reformat files (no Prettier in repo); commit, push, stash, reset, or create or
modify worktrees; touch port 3000; start Part B before Mason has replied to
the Part A report.

## 8. Implementer's report

Files changed; Q1–Q8 (Part A) each pass / fail / not run with how observed;
test counts before and after; every place this plan's line numbers were wrong
with the line found instead; anything skipped and why. Then stop.

## 9. Handoff message for the implementing agent

Copy verbatim.

```
Implement Part A only of docs/studio-rail-restructure-plan.md in
/home/mason/Projects/persona script (note the space; quote the path). Repo
mtmitchel/personascript, branch main, uncommitted tree on top of 731e1b3.
Read AGENTS.md first, then the plan in full. Verify live state before
editing: git status --short (many modified and untracked paths exist — touch
only the files the plan names), git log --oneline -3, npm run lint && npm
test (record the pass count).

Do §3.1–§3.6 in order, then §5 (Part A tests only). Every product decision is
made in §2 — do not relitigate or add alternatives; where a decision has an
"if vetoed" branch, implement the primary, not the branch. §7 lists what you
must not touch. Do not start §4 (Part B).

After each file: npm run lint && npm test. Update tests that assert renamed
strings; never weaken or delete an assertion without replacing it with one
for the new behaviour. Then npm run build. Then run Q1–Q8 in §6 on a private
server on port 3100 with DISABLE_HMR=true (restart it after every
source/CSS change; find its pids via /proc/*/environ containing PORT=3100;
kill by numeric pid only). Mock window.fetch in-page before anything that
would call /api/plan-draft or /api/rewrite*; real model calls cost the owner
money. If you cannot open a browser, say so — do not describe static markup
as "rendered".

Repo has no Prettier; do not reformat files. Sentence case. Plain English.
No internal vocabulary (plan, decision, passage, anchor) in UI text.

Report per §8. Leave changes uncommitted.
```

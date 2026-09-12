# Studio mitigation plan — target, action, and status defects

> Partly reversed by docs/anti-pattern-remediation-plan.md (2026-09-12): P1, P4, P5, Mark read, history labels.

Written 2026-09-11 against commit `731e1b3`. Implementation plan for a cheaper
agent; QA by the planning agent. Read `AGENTS.md` first.

## 0. What this plan is and is not

A source audit of the Studio (`src/components/StudioView.tsx` and the rail and
document components it composes) found defects of **object identity** (which
text an action targets), **action consequence** (what a label actually does),
and **status truthfulness** (what a disabled control or a status line claims).
Every finding below was verified line by line at `731e1b3`. The audit did not
render the screen; Mason's rendered verdict ("still garbage") has not been
itemised and is **not** addressed by this plan. Visual restyling, rail width,
density, and the two-task-mode restructure are deliberately deferred (§9).

This plan fixes confirmed logic and copy defects with the smallest local change
each. It does not restructure the rail. It does not touch planning, rewrite,
review, or storage logic in `src/context/WritingAssistantContext.tsx`,
`src/editorialPlan.ts`, `src/writingPipeline.ts`, or `server.ts`.

## 1. Confirmed defects (evidence at `731e1b3`)

| # | Defect | Evidence |
|---|--------|----------|
| D1 | The Suggestions rail prepares a rewrite of `draftText`, but when any version is open the document's *Original* view renders `rewriteResult.originalText`. If the draft was edited after that version, the author approves suggestions beside the wrong text. | `StudioView.tsx` L71–72 (plan sources use `draftText`), L494 (`renderProse(rewriteResult.originalText, 'original')`) |
| D2 | Adding an author request from selected text requires `!hasRewrite`. Once any version exists the route is gone even when a fresh, editable plan exists. | `StudioView.tsx` L238 `docView === 'original' && !hasRewrite && canRequest` |
| D3 | In *Changes*, **Accept** / **Accept all** / **Accepted · Undo** are a session-only reading marker held in `DiffViewer` local state; **Keep original** / **Restore** / **Remove** edit the saved text; the toolbar **Undo** reverts text edits. Same visual weight, same words, different consequences. Read state is lost whenever the view switches because `DiffViewer` unmounts. | `DiffViewer.tsx` L33 `useState<string[]>([])`, L157 and L216 two unrelated `Undo`s; `StudioView.tsx` L476–489 conditional mount |
| D4 | `suggestionsStatus` never receives `isLearningFeedback`, but `busy` (L70) includes it, so the line can read "Ready to rewrite." under a disabled **Rewrite**. Clipboard failure in `handleCopy` writes `rewriteError`, which renders only inside the Suggestions panel. | `studioStatus.ts` input type; `StudioView.tsx` L70, L181–190, L578 |
| D5 | **Reject** and **Ignore** both become `decision: 'keep'` at approval; the author is asked to make a distinction the product discards. | `editorialPlan.ts` L169 |
| D6 | Getting new suggestions replaces the plan, discarding answers and author requests with no warning. | `WritingAssistantContext.tsx` L857 `setEditorialPlan({ plan, … })`; `StudioView.tsx` L590–596 |
| D7 | Arrow keys change the selected rail tab without moving focus; tabs all have `tabIndex` 0 by default. | `StudioView.tsx` L131–145 |
| D8 | Inserted words in *Changes* are distinguished by colour only (`text-decoration: none`). | `src/index.css` L86 |
| D9 | Copy contradictions: rail says "You answer them before rewriting." while unanswered suggestions are accepted on rewrite; status says "Get suggestions first. The rewrite follows the suggestions you accept."; stale reason list joins with commas ("Your rewrite instructions, draft changed…"); "older format" is an implementation explanation. | `StudioView.tsx` L676–677; `studioStatus.ts` L64–83 |
| D10 | Version rows are named by operation kind only ("Quick adjustment", "Selection edit"); several versions read identically. | `rewriteHistory.ts` L109–114; `RewriteHistory.tsx` L34 |
| D11 | Review panel verbs imply correction: **Edit this issue** opens a request, **Mark reviewed** is a reading marker; **Compare sources** opens *Changes*; **Change reviewer** opens model settings. | `WritingReviewPanel.tsx` L98–105, L153, L182 |

## 2. Product decisions taken in this plan

Mason may veto any of these; each is reversible.

- **P1. The document follows the rail task.** On the *Suggestions* tab the
  document always shows the **current draft** (`draftText`) and the
  Original/Rewrite/Changes switcher is hidden. On *Ask for a change* and
  *Review* the document shows the **open version** with the switcher. This is
  the smallest fix for D1 and D2 and is the same rule the eventual
  two-mode design would use.
- **P2. Remove the reading markers from *Changes*.** Delete **Accept**,
  **Accept all**, **Accepted · Undo** and the "n of m changes to look at" count.
  Keep **Previous / Next** (now over every change), the text-editing actions,
  and the text **Undo**. Rationale: a solo author reading a two-column diff
  does not need a checklist; the marker's only effects were visual and were
  lost on view change (D3). *Fallback if vetoed:* rename to **Mark read** /
  **Mark all read** / **Read · Mark unread** and lift `accepted` into
  `StudioView` keyed by `rewriteResult.id` so it survives view switches.
- **P3. Two suggestion answers, not three.** **Accept** / **Decline**; states
  **Accepted** / **Declined**. Legacy `response: 'ignored'` displays as
  **Declined**. Bulk action becomes **Accept the rest**. No type or backend
  change; `'ignored'` stays in the union and the validator (D5).
- **P4. Stable secondary label.** The button is always **Get suggestions**
  (`AGENTS.md`: labels stable). When the current plan holds answers or
  requests and is not yet approved, the click first asks
  `window.confirm('Getting suggestions again replaces your answers and requests. Continue?')` (D6).
  Native dialog is consistent with the existing Delete / Clear confirmations.
- **P5. One selection-toolbar label per destination.** *Suggestions* tab:
  **Add request** (opens the request form). Edit tabs: **Ask for a change**
  (opens the edit composer). The composer already shows scope ("Selected in
  the original draft" vs scoped selection), so the label no longer encodes it.
- **P6. Unanswered suggestions stay accepted on rewrite.** Behaviour unchanged;
  only the copy that contradicts it is fixed (D9).

## 3. Implementation — file by file

Do not reformat files (no Prettier). Keep sentence case. Keep every `id`
attribute listed unless this plan renames it.

### 3.1 `src/components/StudioView.tsx`

**a. Document target follows the rail tab (P1, D1).**

Add after `const hasRewrite = Boolean(rewriteResult);`:

```ts
// The Suggestions tab prepares the next rewrite of the current draft; the
// other tabs act on the open version. The document shows whichever one the
// rail is working on.
const preparing = railTab === 'suggestions';
const draftDiffers = hasRewrite && rewriteResult!.originalText !== draftText;
```

In the document toolbar, change the switcher condition
`{hasRewrite ? (<div className="studio-view-switcher" …>` to
`{hasRewrite && !preparing ? (…`. In the `else` identity branch:

```tsx
<div className="studio-document-identity">
  <span className="studio-document-label">{hasRewrite ? 'Current draft' : 'Original draft'}</span>
  <span className="studio-document-fact">{draftWords} words</span>
  {draftDiffers && <span className="studio-document-fact">Changed since the open version</span>}
</div>
```

In the prose rendering chain (currently L476–499) make the first branch:

```tsx
{preparing && draftText.trim() ? (
  renderProse(draftText, 'draft')
) : hasRewrite && rewriteResult && docView === 'changes' ? (
  <DiffViewer … />
) : … unchanged …
```

Leave `handleSelectRailTab` as is (it already sets `docView` to `'original'`
when entering Suggestions and `'changes'` when leaving it).

Update the `aria-label` on `#rendered-prose-container`:
`preparing ? (canRequest ? 'Current draft. Select text to add a request.' : 'Current draft') : 'Rewrite beside the original draft. Select text to ask for a change.'`.

**b. Selection routing (P5, D2).** Replace the `if (!busy && !docPanel) { … }`
block (L237–262) with:

```ts
if (!busy && !docPanel) {
  if (preparing && canRequest) {
    selectionEnabled = true;
    selectionLabel = 'Add request';
    onSelectionAct = () => applyResolvedSelection({ type: 'source-request', draftText });
  } else if (!preparing && rewriteResult) {
    if (docView === 'original') {
      selectionEnabled = true;
      selectionLabel = 'Ask for a change';
      onSelectionAct = () => applyResolvedSelection({ type: 'original-highlight' });
    } else if (docView === 'rewrite') {
      selectionEnabled = true;
      selectionLabel = 'Ask for a change';
      onSelectionAct = () => applyResolvedSelection({ type: 'rewrite-prose', rewrittenText: rewriteResult.rewrittenText });
    } else if (docView === 'changes' && selectionSide === 'rewrite') {
      selectionEnabled = true;
      selectionLabel = 'Ask for a change';
      onSelectionAct = () => applyResolvedSelection({ type: 'changes-rewrite', rewrittenText: rewriteResult.rewrittenText, blocks });
    } else if (docView === 'changes' && selectionSide === 'original') {
      selectionEnabled = true;
      selectionLabel = 'Ask for a change';
      onSelectionAct = () => applyResolvedSelection({ type: 'changes-original' });
    }
  }
}
```

`applyResolvedSelection` is unchanged: the `'source'` branch already sets the
rail to `suggestions` and focuses `#input-passage-request`.

**c. Copy failure stays with Copy (D4).** Replace `copied` state with
`const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');`.

```ts
const handleCopy = async () => {
  if (!rewriteResult) return;
  try {
    await navigator.clipboard.writeText(rewriteResult.rewrittenText);
    setCopyState('copied');
  } catch {
    setCopyState('failed');
  }
  setTimeout(() => setCopyState('idle'), 2500);
};
```

Button:

```tsx
<button id="btn-copy-rewritten" type="button" onClick={handleCopy} aria-live="polite">
  {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
  <span>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Could not copy — use Export' : 'Copy rewrite'}</span>
</button>
```

Export summary label: `<span>Export rewrite</span>`. The `studioView.test.ts`
toolbar-order check uses `indexOf('Copy')` / `indexOf('Export')`; both still
match.

**d. Status inputs (D4).** Pass `isSavingVoice: isLearningFeedback` to
`suggestionsStatus` (see §3.3).

**e. Stable secondary label and replacement warning (P4, D6).**

Secondary button label: `{isPlanning ? 'Getting suggestions…' : 'Get suggestions'}`.

`handleGetSuggestions`:

```ts
const handleGetSuggestions = async () => {
  if (busy || !hasDraft) return;
  const hasWork = plan && !plan.approved && (
    plan.plan.items.some(item => item.response) || (plan.plan.requests || []).length > 0
  );
  if (hasWork && !window.confirm('Getting suggestions again replaces your answers and requests. Continue?')) return;
  setRewriteError(null);
  … unchanged …
};
```

**f. Rail tab keyboard focus (D7).** In `onTabKeyDown`, after each
`handleSelectRailTab(nextTab)` / `(prevTab)` add
`document.getElementById('rail-tab-' + nextTab)?.focus();` (respectively
`prevTab`). Add `tabIndex={railTab === 'suggestions' ? 0 : -1}` to the
Suggestions tab button and the equivalent for `change` and `review`, so the
strip is one tab stop.

**g. Copy (D9).** L675–678 description → 
`Suggestions show what the rewrite would keep, shorten, or cut. Answer the ones you disagree with; the rest are used when you rewrite.`

Request form heading L644 `Rewrite this passage` → `Request for the next rewrite`.

`reviseBlock` is unchanged; it is now reached from the **Ask for a change**
action in `DiffViewer` (§3.2).

### 3.2 `src/components/DiffViewer.tsx` (P2, D3, D8)

Remove: `accepted` state, `keyOf`, `toggleAccepted`, `acceptAll`, `remaining`,
`unacceptedIndices`, `isAccepted`, `settled` (replace with
`block.kind === 'equal'`), the `is-accepted` class, the **Accept** button, the
**Accepted · Undo** pair, and **Accept all**.

Navigation: `changeIndices = blocks.map((b, i) => b.kind !== 'equal' ? i : -1).filter(i => i >= 0)`;
`currentFocus = focusIndex ?? changeIndices[0] ?? null`; `hasPrev` / `hasNext`
computed over `changeIndices`. Previous/Next remain rendered only when
`changes.length > 1` (existing behaviour; the spec prescribed it and
`diffToolbar.test.ts` asserts it).

Count text: `changes.length === 0 ? 'No changes.' : changes.length === 1 ? '1 change.' : `${changes.length} changes.``

Toolbar Undo: label **Undo text change**, `title="Undo the last Use original text, Restore deleted text, or Remove added text"`.

Per-block actions (unchanged blocks render none):

```tsx
<div className="studio-change-actions">
  {onKeepOriginal && (
    <button type="button" className="studio-text-button" onClick={() => onKeepOriginal(index)}>
      {block.kind === 'added' ? 'Remove added text' : block.kind === 'removed' ? 'Restore deleted text' : 'Use original text'}
    </button>
  )}
  {onRevise && block.rewritten.length > 0 && (
    <button type="button" className="studio-text-button" onClick={() => onRevise(block)}>Ask for a change</button>
  )}
</div>
```

Update the component doc comment to match. Remove the now-unused `useState`
import only if `focusIndex` is also removed — it is not; keep `useState`.

CSS (`src/index.css` L86, L90): give insertions a non-colour cue.

```css
.studio-change-added { background: var(--color-emerald-50); color: var(--color-emerald-900); text-decoration: underline; text-decoration-color: var(--color-emerald-700, #047857); text-underline-offset: 3px; border-radius: 3px; padding: 0 2px; }
.studio-change-side > ins.studio-change-added .studio-source-paragraph { color: var(--color-emerald-900); text-decoration: underline; text-decoration-color: var(--color-emerald-700, #047857); text-underline-offset: 3px; }
```

Delete `.studio-change.is-accepted { … }` at `index.css` L82. Leave
`.studio-note-row.is-accepted` (L144); that one belongs to suggestion rows.

### 3.3 `src/utils/studioStatus.ts` (D4, D9)

Add `isSavingVoice?: boolean` to `StudioStatusInput`. Insert after the
upload check (priority 4):

```ts
if (input.isSavingVoice) {
  return { text: 'Saving your voice preference…', tone: 'status' };
}
```

Replace strings:

| Priority | New text |
|---|---|
| 2 | `Getting suggestions…` |
| 6 | `Get suggestions before rewriting.` |
| 7 (with reasons) | `Your ${joinList(reasons)} changed after these suggestions were prepared. Get suggestions again before rewriting.` |
| 7b (no reasons) | `Get suggestions again before rewriting. Your draft is unchanged.` |
| 9 | `The last rewrite used these suggestions. Rewrite makes a new version from the current draft.` |
| 10 | unchanged (P6) |

Add a local helper:

```ts
const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
```

### 3.4 `src/components/EditorialDecisions.tsx` (P3, D5)

```ts
const RESPONSE_LABEL: Record<Response, string> = { accepted: 'Accepted', rejected: 'Declined', ignored: 'Declined' };
```

Answer buttons: **Accept** → `respond(section, 'accepted')`; **Decline** →
`respond(section, 'rejected')`. Delete the Ignore button. Bulk button text
**Accept the rest**. Update the component doc comment ("accept or decline").
Leave `.is-ignored` CSS rules; saved plans may still carry `'ignored'`.

### 3.5 `src/components/WritingReviewPanel.tsx` (D11)

| Current | New |
|---|---|
| `Edit this issue` | `Ask for a change` |
| `Mark reviewed` / `Reviewed · undo` | `Mark read` / `Read · Mark unread` |
| `{n} issue(s) marked reviewed this session.` | `{n} of {primaryFindings.length} notes read.` |
| `Compare sources` | `Show changes` |
| `Change reviewer` | `Model settings` |
| `Marking reviewed does not edit the draft.` | `Marking a note read does not edit the draft.` |
| failure sentence | `The review failed. The rewrite itself is complete. Read it yourself, or ask for a change to get a new review.` |

### 3.6 `src/components/RewriteFeedbackManager.tsx`

| Current | New |
|---|---|
| `Selected passage` | `Selected text` |
| `This passage only` | `Selected text only` |
| `The whole draft` | `The whole rewrite` |
| `Apply` / `Applying…` | `Apply edit` / `Applying…` |
| `Only the selected passage will change.` | `Only the selected text will change.` |
| `The whole draft may change; the selection is the reference.` | `The whole rewrite may change; the selection is a reference.` |
| checkbox text | `Also save this as a rule in my Voice Blueprint for future writing.` |

Keep the checkbox conditional (`preferenceLike`) and unchecked by default.

### 3.7 `src/utils/rewriteHistory.ts` and `src/components/RewriteHistory.tsx` (D10)

```ts
export function revisionLabel(result: RewriteResult): string {
  if (result.revision?.kind === 'refine') return 'Whole-rewrite edit';
  if (result.revision?.kind === 'selection') return 'Selected-text edit';
  if (result.revision?.kind === 'rewrite') return 'Full rewrite';
  return 'Saved version';
}

/** First line of the author's instruction, shortened, so versions are telling apart. */
export function revisionExcerpt(result: RewriteResult, max = 80): string {
  const text = (result.revision?.instruction || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
```

In `RewriteHistory.tsx` render the excerpt under the name when present:
`{revisionExcerpt(entry) && <p className="studio-history-meta">“{revisionExcerpt(entry)}”</p>}`.
Toolbar labels **History** and **Details** stay.

### 3.8 Documentation owners (required by `AGENTS.md`)

- `README.md` — *Review suggested edits* (L53), *Editing requests* (L67),
  *Changes view* (L68), *Review* (L69), *Version history* (L70): replace every
  renamed label; delete the Accept/Accept all reading-state sentences; state
  that the Suggestions tab shows the current draft and the other tabs the open
  version; state the replacement confirmation; **Get new suggestions** →
  **Get suggestions**; **Reject**, **Ignore** → **Decline**.
- `DESIGN.md` L135 and L139 — same renames; insertion underline; remove the
  "accepted passage drops its colour" clause.
- `docs/ui-redesign-spec.md` — do not edit; it is history. Add one line at
  its top: `Superseded in part by docs/studio-mitigation-plan.md (2026-09-11).`

## 4. Tests

Update, never weaken. Add assertions for the new behaviour.

- `tests/studioView.test.ts`
  - Fixture 2: `Get new suggestions` → `Get suggestions`; `/Accept all/` →
    `/Accept the rest/`; add `assert.match(html, /Original draft/)` and
    `assert.equal(html.includes('id="view-mode-original"'), false)`.
  - Fixture 3: secondary label → `Get suggestions`; status priority 9 text →
    new sentence; add `/Copy rewrite/` and `/Export rewrite/`; the switcher
    assertions still hold because the initial tab is `review`.
  - Add fixture 4 `editedDraftWithOpenVersionFixture` to
    `tests/fixtures/studioWorkspace.ts`: spread `approvedPlanWithRewriteFixture`,
    override `draftText` with
    `'First paragraph of original draft, now edited.\n\nSecond paragraph of original draft.'`,
    and override `editorialPlan` with `{ ...approvedPlanState, approved: false, sources: { ...approvedPlanState.sources, draft: <same edited string> } }`.
    Static markup renders the initial state only (Review tab, open version),
    so it cannot exercise the Suggestions-tab switch; the fixture exists for
    browser QA injection (§6 Q1–Q3). Add one static assertion for it anyway:
    render and `assert.match(html, /id="view-mode-changes"[^>]*aria-pressed="true"/)`
    to lock the initial state.
- `tests/diffToolbar.test.ts` — rewrite: count text `2 changes.` / `1 change.`
  / `No changes.`; assert `Accept` and `Accept all` are absent; Previous/Next
  presence rules unchanged; Undo `title` text updated; assert per-block
  `Use original text` and `Ask for a change` on changed blocks.
- `tests/studioStatus.test.ts` — update priorities 2, 6, 7, 7b, 9 and the
  ordering test; add `isSavingVoice` test (priority between upload and
  error; `'Saving your voice preference…'`); add `joinList` cases through
  priority 7 with one, two, and three reasons.
- `tests/selectionToolbar.test.ts` — labels are fixture strings only; change
  to `'Add request'` for tidiness.
- `tests/rewriteHistory.test.ts` — add `revisionLabel` and `revisionExcerpt`
  cases (empty instruction → `''`; long instruction truncates with `…`).
- Grep `tests/` for `Reject`, `Ignore`, `Edit this issue`, `Mark reviewed`,
  `Compare sources`, `This passage only`, `>Apply<` before finishing; none
  matched at `731e1b3` except the two files above, but confirm.

## 5. Order of work and checkpoints

1. §3.3 status + tests → `npm run lint && npm test`.
2. §3.2 DiffViewer + CSS + tests → lint/test.
3. §3.4 EditorialDecisions → lint/test.
4. §3.1 StudioView (a–g) + fixture/test updates → lint/test.
5. §3.5–3.7 copy and history → lint/test.
6. §3.8 docs.
7. `npm run build`.

Commit nothing. Report per §8.

## 6. Browser verification protocol (implementer runs; planner repeats)

- Never touch port 3000 (Mason's instance). Start a private server:
  `cd "/home/mason/Projects/persona script" && (PORT=3100 DISABLE_HMR=true nohup npm run dev > /tmp/ps-3100.log 2>&1 &)`.
  `DISABLE_HMR` disables file watching: **restart after every source/CSS
  change**. Find its pids by scanning `/proc/*/environ` for `PORT=3100`; kill
  by numeric pid only.
- Never call model endpoints. Before any action that would call
  `/api/plan-draft`, `/api/rewrite*`, `/api/synthesize-profile`, monkeypatch
  `window.fetch` in-page via `page.evaluate` to return a canned response
  (Playwright `page.route` hangs in this environment).
- Inject fixtures into `localStorage` (`personascript_workspace_v1`,
  `personascript_profile_v2`, `personascript_samples_v2`) from
  `tests/fixtures/studioWorkspace.ts`, reload.
- `window.confirm` interrupts Playwright and is auto-accepted on resume;
  re-inject fixtures after any destructive confirm.
- Playwright sandbox: no `Buffer`/`require`/top-level `document`; use a
  TreeWalker for text nodes when selecting text.

### Acceptance checks

| # | Setup | Action | Expected |
|---|---|---|---|
| Q1 | Fixture 4 (draft differs from open version's original) | Click **Suggestions** tab | Document shows the *current* draft text; no Original/Rewrite/Changes switcher; identity reads `Current draft · n words · Changed since the open version` |
| Q2 | Same | Click **Ask for a change** | Switcher returns; *Changes* selected; columns show the open version's original and rewrite |
| Q3 | Fixture 4 on Suggestions, plan unapproved | Select a phrase in the draft | Toolbar shows **Add request**; clicking opens the **Request for the next rewrite** form with the quote; **Add request** adds it under **Your requests** |
| Q4 | Fixture 3, Ask for a change, *Rewrite* view | Select text | Toolbar shows **Ask for a change**; composer shows **Selected text** with **Selected text only / The whole rewrite** |
| Q5 | Fixture 3, *Changes* | Inspect | Toolbar: `n changes.` · Previous · Next (if >1) · **Undo text change** only after a text edit; no Accept/Accept all; changed block offers **Use original text** and **Ask for a change**; added text is underlined |
| Q6 | Fixture 3, *Changes* | **Use original text** on a block, then **Undo text change** | Text reverts; review is dropped after the edit (existing behaviour) |
| Q7 | Fixture 2 | Inspect a suggestion row | **Accept** / **Decline** only; after Decline the state reads **Declined · Undo**; summary offers **Accept the rest** |
| Q8 | Fixture 2 with one answer recorded | Click **Get suggestions** | `confirm` appears with the replacement text; cancel → plan untouched |
| Q9 | Fixture 3 | Rail keyboard: focus Suggestions tab, press → | Focus and selection move together to **Ask for a change**; Tab leaves the strip in one stop |
| Q10 | Any with rewrite | Deny clipboard permission or stub `navigator.clipboard.writeText` to reject; click **Copy rewrite** | Button reads `Could not copy — use Export` for ~2.5 s; Suggestions status line unchanged |
| Q11 | Fixture 3 | Status line on Suggestions | `The last rewrite used these suggestions. Rewrite makes a new version from the current draft.` |
| Q12 | Fixture 3, Review tab | Inspect | **Ask for a change**, **Mark read**, **Show changes**, **Model settings**; marking one reads `1 of n notes read.` |
| Q13 | Fixture 3, History | Inspect rows | Kind label plus instruction excerpt where the version has one |
| Q14 | All | `npm run lint && npm test && npm run build` | Clean |

## 7. Out of scope for the implementer

Do not: restructure the rail into two modes; persist `requestText`; add
review-only retry; change when the preference checkbox appears; reorder
conflicts above settings; touch `WritingAssistantContext.tsx`,
`editorialPlan.ts`, `writingPipeline.ts`, `server.ts`, storage keys, prompts,
or the four untracked private paths; push, commit, amend, or rebase; create
or modify worktrees; restart port 3000.

## 8. Implementer's report

State: files changed; each acceptance check Q1–Q14 as pass / fail / not run
with how it was observed (static markup vs browser); test counts before and
after; anything in this plan that turned out to be wrong at the current HEAD,
with the line you found instead.

## 9. Deferred (needs Mason's screen-level feedback first)

Ranked from the audit, with the reason for deferral:

1. Two task modes (*Prepare rewrite* | *Edit & review*) with one shared
   request composer — structural; decide after Mason itemises the rendered
   complaints, since it moves the same controls he is reacting to.
2. Persist unfinished request text in the working copy and carry valid author
   requests across regeneration — needs a `StudioWorkspace` shape change and
   quotation revalidation.
3. Review-only retry and explicit review freshness (`Review needs updating`)
   — needs a context-level operation and a review-versus-text identity.
4. Always-available Voice Blueprint opt-in in the edit composer.
5. Blocking conflict question above instructions/settings; collapse answered
   sections.
6. Preservation-setting save failures into the recovery banner
   (`WritingAssistantContext.tsx` L511–560 log to console).
7. Draft & Brief **Clear** consistency; replace native `confirm`/`prompt`
   dialogs; move **Reset presets** out of the header.
8. Rail density, control sizing, and visual hierarchy — the likely subject of
   Mason's verdict; do not act until he names the elements.

## 10. Handoff message for the implementing agent

Copy verbatim to the implementing agent.

```
Implement docs/studio-mitigation-plan.md in /home/mason/Projects/persona script
(note the space; quote the path). Repo mtmitchel/personascript, branch main,
HEAD 731e1b3. Read AGENTS.md first, then the plan in full. Verify live state
before editing: git status --short (four untracked private paths exist — never
touch them), git log --oneline -3, npm run lint && npm test (expect 267 pass).

Do exactly §3 (implementation), §4 (tests), §3.8 (docs) in the order given in
§5. Every product decision is already made in §2 — do not relitigate or add
alternatives. §7 lists what you must not touch: no rail restructure, no
changes to WritingAssistantContext.tsx / editorialPlan.ts /
writingPipeline.ts / server.ts / storage keys / prompts; no commit, push,
amend, rebase, or worktree; never restart or touch the app on port 3000
(that is the owner's live instance).

Verification: after each step run npm run lint && npm test. Update tests
that assert renamed strings; never weaken or delete an assertion without
replacing it with one for the new behaviour. Then run npm run build. Then run
the browser checks Q1–Q14 in §6 on a private server on port 3100 with
DISABLE_HMR=true (restart it after every source/CSS change; find its pids via
/proc/*/environ containing PORT=3100; kill by numeric pid only). Mock
window.fetch in-page before anything that would call /api/plan-draft or
/api/rewrite*; real model calls cost the owner money. If you cannot open a
browser, say so — do not describe static markup as "rendered".

Repo has no Prettier; do not reformat files. Sentence case. Plain English.

Report per §8: files changed; Q1–Q14 each pass/fail/not-run with how observed;
test counts before/after; anything in the plan that was wrong at HEAD, with
the line you found instead. Leave changes uncommitted.
```

## 10. Handoff message for the implementing agent

Copy verbatim.

```
Implement docs/studio-mitigation-plan.md in "/home/mason/Projects/persona script"
(the path contains a space; quote it). Repo mtmitchel/personascript, branch
main, HEAD 731e1b3. Read AGENTS.md first, then the plan in full.

Verify live state before editing:
  git status --short        (four untracked private paths exist; never touch them)
  git --no-pager log --oneline -3
  npm run lint && npm test  (expect 267 passing)

Do exactly §3 (implementation), §4 (tests), and §3.8 (docs), in the order
given in §5. Every product decision is already made in §2; do not relitigate
or offer alternatives. §7 lists what you must not touch: no rail restructure;
no edits to WritingAssistantContext.tsx, editorialPlan.ts, writingPipeline.ts,
server.ts, storage keys, or prompts; no commit, push, amend, rebase, or
worktree; never restart or touch the app on port 3000 (the owner's live
instance).

Verification: after each step run `npm run lint && npm test`. Update tests
that assert renamed strings; never weaken or delete an assertion without
replacing it with one for the new behaviour. Then `npm run build`. Then run
browser checks Q1–Q14 (§6) on a private server:
  (PORT=3100 DISABLE_HMR=true nohup npm run dev > /tmp/ps-3100.log 2>&1 &)
DISABLE_HMR disables file watching: restart after every source/CSS change.
Find its pids by scanning /proc/*/environ for PORT=3100; kill by numeric pid
only. Monkeypatch window.fetch in-page before anything that would call
/api/plan-draft or /api/rewrite*; real model calls cost the owner money.
Playwright page.route hangs here; window.confirm is auto-accepted on resume.
If you cannot open a browser, say so; do not describe static markup as
"rendered".

No Prettier in this repo; do not reformat files. Sentence case. Plain English.

Report per §8: files changed; Q1–Q14 each pass / fail / not run, with how it
was observed; test counts before and after; anything in the plan that was
wrong at HEAD, with the line you found instead. Leave all changes uncommitted.
```

# PersonaScript UI redesign — implementation specification

Status: approved for implementation by Mason (product owner). Written 2026-09-11 after a control-by-control inventory of every screen in `src/components/` and the state that drives them in `src/context/WritingAssistantContext.tsx`.

This document is a **complete structural specification**. It tells the implementing agent what each screen contains, in what order, with what labels, driven by what state, and where every existing control moves. It is not a styling brief: the visual system in `DESIGN.md` is reused unchanged.

---

## 0. For the implementing agent — read this first

### 0.1 Read before touching code

1. `AGENTS.md` — repository rules. Binding.
2. `README.md` §"Development while the app is in use" — the running `npm run dev` on port 3000 is **the owner's live instance**. Never restart it. For your own rendered checks run a second server: `PORT=3100 DISABLE_HMR=true npm run dev`, and stop it when done.
3. `DESIGN.md` §4 "Component Stylings" and §5 "Layout Principles" — every class you need already exists. Do not invent colours, radii, shadows, or type sizes.
4. `ARCHITECTURE.md` §"Editorial plan" — the plan contract. You will not change it.
5. This document, in full, before the first edit.

### 0.2 Hard rules

- **This document is the instruction, not the deliverable.** Do not edit it. The deliverable is working code in `src/`, tests in `tests/`, and the doc updates in §13. If a passage of this spec is wrong, ambiguous, or impossible, implement the closest correct thing, and list it under *Deviations from spec* in your slice report (§12.3) so the owner can rule on it. Auditing or rewriting the spec is not progress.
- **No functionality is removed.** §10 is a ledger of every existing control and its new home. If you cannot place a control where the ledger says, stop and report; do not drop it.
- **Nothing in `src/context/`, `server.ts`, `src/editorialPlan.ts`, `src/writingPipeline.ts`, or any prompt changes.** This is a UI restructuring. The only context change permitted is described in §5.8 (one optional derived helper) and §6 (one optional return value); both are additive.
- **Every `localStorage` shape stays readable.** You add no new persisted fields except where §5.8 says so, and those are optional.
- **Labels are stable.** A button's label does not change based on hidden state. It may show progress text while busy (`Rewriting…`) and returns to its label afterwards. If an action is unavailable, the button is `disabled` and one line beneath it says why. Never hide a primary control because its precondition is unmet.
- **Actions sit at the top of the region they govern, pinned, never at the bottom of a scroll region and never as a text link after content.**
- **No auto-navigation on selection.** Selecting text shows a toolbar; only clicking the toolbar acts.
- **Disclosure depth ≤ 2** (a list, and one level of detail inside an item). Anything deeper is a defect.
- **One primary (black) button per visible screen.** Tabs count as separate screens.
- **Plain English.** No internal vocabulary in UI copy: decision, anchor, limit, treatment, coverage, digest, paragraph IDs, source (as a noun for the draft), plan. Use the words in the copy tables here verbatim. The word *passage* in `AGENTS.md`'s list refers to the plan's passage anchors (paragraph ranges); the ordinary English word for a stretch of selected text is allowed and is already shipped copy (`Selected passage`, `This passage only`). Do not rename it and do not edit this specification's copy tables; if a string looks wrong, report it (§12.3) and implement it as written.
- After any change to `src/`: `npm run lint` and `npm test`. Both must pass before you move to the next slice.
- **Do not commit.** Do not touch untracked files you did not create. Do not modify `docs/editorial-logic-restoration-plan.md`.

### 0.3 How to work

Implement in the slice order of §11. After each slice: lint, test, render on port 3100 with a browser, walk the acceptance checklist for that slice, then report (format in §12). Do not start the next slice with a failing check.

---

## 1. Diagnosis — why the current UI fails

Structural defects, ranked by damage to the user's ability to finish a task. File references are to current code.

| # | Defect | Where | Why it breaks the job |
|---|---|---|---|
| D1 | **One button, seven labels.** The rail's only primary reads `Suggest changes` / `Get new suggestions` / `Accept all and rewrite` / `Rewrite` / `Rewrite from source` / `Add draft` / `Reading your draft…` depending on five hidden booleans. | `StudioView.tsx` ~L308 | The user cannot predict what the button will do, so cannot plan a path. Today this alone stopped the owner from re-running the planner. |
| D2 | **Re-planning has no direct action.** The planner runs only when `!editorialPlan \|\| planStale`; the user must *change an input* to make the plan stale. | `StudioView.tsx` `startRewrite` | The system decides when the user may ask for suggestions. |
| D3 | **Three rail modes, no visible switch.** `panel: 'source' \| 'edit' \| 'review'` is reached via a text link at the bottom of one panel, a `Back to the rewrite` link at the top of another, and a `Review (n)` button in the *other* pane's toolbar. | `StudioView.tsx` `openPanel`, `RewriteFeedbackManager.tsx` `onStartOver` | Nothing tells the user three modes exist. |
| D4 | **Primary routes buried as text links after scrollable content.** `Start a new rewrite from the original draft`, `Ask for different suggestions`, `Change` (writing settings). | rail bottoms | Users hunt. |
| D5 | **Selection hijacks the rail.** Selecting text in the rewrite immediately switches the rail to *Ask for a change*. | `handleTextSelection` | Selecting to copy or read changes the screen. |
| D6 | **Layout changes shape by state.** Controls appear/disappear: request form on selection, instruction field behind a link, settings behind a link, `Back to the rewrite` sometimes. | Studio rail | Nothing stays still long enough to learn. |
| D7 | **Track-changes summary scrolls away.** The "N of M changes to look at · Undo" line is the first row of scrolling content; no Next/Previous. | `DiffViewer.tsx` | Review of a long document loses its controls. |
| D8 | **No clean view of the result.** Document views are `Original` and `Changes`; the finished rewrite cannot be read on screen without markup. | `StudioView.tsx` `viewMode` | The basic job — read what I'm about to publish — is missing. |
| D9 | **Two primaries per page on steps 1–4.** Each step header has a black `Continue to …` beside the page's own action (`Add samples`, `Edit`, etc.); Samples has *two* black buttons plus a secondary. | `SamplesView`, `ProfileView`, `DraftBriefView`, `DomainView` headers | The stepper's "next" competes with the screen's job. |
| D10 | **Analysis auto-navigates.** `Analyze Voice Profile` throws the user onto the Blueprint tab when it finishes. | `SamplesView.tsx` header | Surprise navigation. |
| D11 | **Mixed editing models on the Blueprint.** Metrics need an `Edit` → `Save` mode; tone sliders and `Additional style rules` are always live and autosave. | `ProfileView.tsx` | Same page, two rules. |
| D12 | **Domain topics are three levels deep** (card → expand → per-convention controls), with `Generate`, `Clear all`, `Add topic`, and the `Use draft and brief` option scattered across the section header and body; the master `Active in rewrites` switch is in the page header, far from what it governs. | `DomainView.tsx` | Depth budget blown; destructive next to generative. |
| D13 | **Dead code.** `DomainExpertiseEditor.tsx` is referenced by nothing. | `src/components/DomainExpertiseEditor.tsx` | Confuses implementers. |
| D14 | Minor: `Not being edited` status text on the document header; `Reset voice and model presets` is an icon with only a `title`; the `Suggested changes` rail header carries a `Back to the rewrite` link that is a mode switch in disguise. | `StudioView`, `Header` | Noise / hidden mode. |

---

## 2. Design rules for this redesign

Derived from the defects above and from how the reference products (§3) solve the same jobs.

- **R1 Stable labels.** Each action has one label. Availability is expressed with `disabled` + a reason line, never with a different label or by hiding.
- **R2 Actions first.** Within a pane, the action bar is the first thing under the pane's title and is pinned (does not scroll).
- **R3 Visible modes.** Where a region has modes, they are tabs (`role="tablist"`) that are always rendered. Unavailable tabs are `aria-disabled` with a `title` saying when they become available.
- **R4 Select, then decide.** Selecting text shows a one-button floating toolbar anchored to the selection. Nothing else happens until the user clicks it.
- **R5 Depth ≤ 2.**
- **R6 One primary per visible screen.**
- **R7 Information before the action it governs.** The status line that explains a button's state sits directly under that button; a stale-inputs warning sits above the list it invalidates.
- **R8 Design system only.** Reuse `.studio-primary`, `.studio-secondary`, `.studio-text-button`, `.studio-view-switcher`, `.studio-notice`, `.studio-inline-notice`, `.studio-field`, `.studio-field-label`, `<details>` with the `.studio-inspector summary` marker, and the Tailwind utilities already used on steps 1–4.
- **R9 Plain English**, copy tables verbatim.
- **R10 Ledger.** No control disappears (§10).

---

## 3. Patterns borrowed

Verified against current product documentation (2026-09). Nothing here is invented.

| Job | Pattern | Reference | Where we apply it |
|---|---|---|---|
| Review AI suggestions before applying | Persistent right sidebar of grouped cards, each with accept/dismiss; a count at the top; clicking a card highlights the passage in the document | Grammarly editor; Word *Editor* pane | Studio → rail → **Suggestions** tab (§5.5.2) |
| Review a rewrite against the original | Track changes: per-change Accept/Reject inline; **Accept all**, **Next**, **Previous** in a fixed toolbar above the document | Word *Review* ribbon; Google Docs *Suggesting* mode | Studio → document → **Changes** view toolbar (§5.4.3) |
| Ask the AI to change a passage | Select text → a floating bar appears at the selection ("Refine" / "Ask Lex" / Copilot margin icon) → the request composer opens with the passage quoted; result replaces or is discarded | Google Docs *Help me write* refine bar; Lex; Word Copilot *Rewrite* | Studio → **selection toolbar** (§5.4.5) → **Ask for a change** tab (§5.5.3) |
| Run the AI again | A stable, always-visible button; a separate *Regenerate* | Word Copilot; Docs | Studio → Suggestions action bar: **Rewrite** and **Get suggestions** (§5.5.2) |
| Versions | A version list opened from the document header; each row has open and delete | Google Docs *Version history* | Studio → **History** panel (unchanged, §5.4.4) |
| Multi-step setup | Numbered steps in a persistent nav; one job per step; a quiet "Next" at the end of the page, never competing with the page's own action | Standard wizard/stepper convention | Header nav (unchanged) + step footer (§4.3) |

---

## 4. Global shell

### 4.1 Header (`src/components/Header.tsx`)

Keep: brand, five numbered nav tabs with the sample count badge, `ModelSelector variant="compact"`, active profile name, reset.

Change:
- The reset control gets a visible label: an inline text button `Reset presets` (`.studio-text-button` styling is Studio-only; use the existing header utility classes `text-xs text-neutral-600 hover:text-neutral-900`). Keep `id="btn-reset-demo"` and the confirm modal exactly as is. Add `aria-label="Reset voice and model presets"`.
- Nothing else.

### 4.2 Footer (`src/App.tsx`)

Keep. Already hidden inside Studio by the existing rule `.studio-app > footer { display: none; }` (`src/index.css` line 18). No change.

### 4.3 Step footer — steps 1–4 (`SamplesView`, `ProfileView`, `DraftBriefView`, `DomainView`)

Every step page ends with one row, right-aligned, containing a single **secondary** button (white, hairline border — the existing `border border-neutral-200 bg-white hover:bg-neutral-50` utility set):

| Page | Label | id | onClick |
|---|---|---|---|
| Writing Samples | `Next: Voice Blueprint →` | `btn-samples-to-profile` | `setActiveTab('profile')` |
| Voice Blueprint | `Next: Draft & Brief →` | `btn-profile-to-draft` | `setActiveTab('draft-brief')` |
| Draft & Brief | `Next: Domain Knowledge →` | `btn-draft-brief-to-domain` | `setActiveTab('domain')` |
| Domain Knowledge | `Next: Rewrite Studio →` | `btn-domain-to-studio` | `setActiveTab('studio')` |

Remove every other `Continue to …` button on those pages (the header ones and the duplicate at the bottom of Samples' detail column and Blueprint's bottom). The page header's right side then holds only the page's own actions (§6–§9). This resolves D9.

### 4.4 Save-status banner (`WorkspaceSaveStatus.tsx`)

Unchanged. It renders only on storage failure.

---

## 5. Rewrite Studio

### 5.1 Brief

- **Job:** turn the draft into a rewrite in my voice that I have checked, and get the text out.
- **Object the user acts on:** the *draft* before a rewrite exists; the *rewrite* (a version) afterwards. Both are shown in the document pane. The rail acts on whichever is shown.
- **Done when:** a version exists whose changes and review findings the author has looked at, and the text has been copied or exported.

### 5.2 Layout

Two panes, as today (`.studio-shell > .studio-split`), left `section.studio-document`, right `aside.studio-inspector`. Widths and breakpoints unchanged (`DESIGN.md` §5).

```
┌───────────────────────────────────────────────┬──────────────────────────────────┐
│ DOCUMENT PANE                                 │ RAIL                             │
│ ┌ toolbar (pinned) ─────────────────────────┐ │ ┌ tab strip (pinned) ──────────┐ │
│ │ [Original][Rewrite][Changes]  1,818 words │ │ │ Suggestions │ Ask for a      │ │
│ │            History · Copy · Export · Info │ │ │             │ change │ Review│ │
│ └───────────────────────────────────────────┘ │ └──────────────────────────────┘ │
│ ┌ changes toolbar (pinned, Changes view only)┐│ ┌ action bar (pinned) ─────────┐ │
│ │ 12 of 29 to look at  ‹ Prev  Next ›       ││ │ [Rewrite]  [Get suggestions] │ │
│ │                      Accept all · Undo    ││ │ status line                  │ │
│ └───────────────────────────────────────────┘│ └──────────────────────────────┘ │
│                                               │ ┌ scroll region ───────────────┐ │
│   prose / two-column track changes            │ │ tab content                  │ │
│   (scrolls)                                   │ │ (scrolls)                    │ │
│                                               │ │                              │ │
│   ┌ selection toolbar (floats at selection) ┐ │ │                              │ │
│   │ Ask for a change                        │ │ │                              │ │
│   └─────────────────────────────────────────┘ │ └──────────────────────────────┘ │
└───────────────────────────────────────────────┴──────────────────────────────────┘
```

The rail's **action bar belongs to the tab**: the Suggestions tab has `Rewrite` + `Get suggestions`; the Ask-for-a-change tab has `Apply` directly under its textarea (the composer *is* the top of that tab); the Review tab has no action bar (its actions are per finding).

### 5.3 State model

Replace the current `panel` / `viewMode` / `instructionOpen` / `documentPanel` state in `StudioView.tsx` with the following. Names are binding so tests and the ledger can refer to them.

```ts
type RailTab = 'suggestions' | 'change' | 'review';
type DocView = 'original' | 'rewrite' | 'changes';
type DocPanel = 'history' | 'details' | null;

const [railTab, setRailTab] = useState<RailTab>('suggestions');
const [docView, setDocView] = useState<DocView>('original');
const [docPanel, setDocPanel] = useState<DocPanel>(null);
```

Derived values (all computed each render; keep the existing helpers):

The plan-state derivations below are **the current ones from `StudioView.tsx` lines 57–68, renamed**. Do not change their logic; the existing tests and the server-side validator depend on it.

```ts
const hasDraft   = draftText.trim() !== '';
const hasRewrite = Boolean(rewriteResult);
const busy       = isRewriting || isPlanning || isLearningFeedback || isUploadingDraft || isUploadingBrief;
const planSources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences, customInstructions: customDirectives };
const plan       = editorialPlan;                                                          // EditorialPlanState | null
const planApproved = Boolean(plan?.approved && planMatchesSources(plan, planSources));     // was `decisionsReady`
const planStale  = Boolean(plan && !planApproved && planNeedsReplacement(plan, planSources)); // unchanged logic
const needsApproval = Boolean(plan && !planApproved && !planStale);                         // unchanged
const planIssue  = plan && needsApproval ? planReadiness(plan.plan, draftText, projectBrief).error : null;
const staleReasons = plan ? planStaleReasons(plan, planSources) : [];                       // from src/utils/editorialSummary
const pending    = plan && needsApproval && (plan.plan.version === 3 || plan.plan.version === 4) ? sectionPlan(plan.plan, draftText).pending : 0;
const canRequest = Boolean(plan && (plan.plan.version === 3 || plan.plan.version === 4) && !plan.approved && !planStale);
const review     = rewriteResult?.review;
const attentionCount = actionableReviewIssueCount(review, rewriteResult?.originalText, rewriteResult?.rewrittenText); // src/utils/reviewEvidence
const needsReview = Boolean(review && (review.status !== 'complete' || attentionCount || review.localChecks.some(c => !c.passed)));
```

Rules that keep the two panes coherent (§5.6 explains why each exists):

```ts
// When a new version arrives (rewriteResult.id changes):
setDocView('changes');
setRailTab(needsReview ? 'review' : 'change');
setDocPanel(null); clearSelection(); setTextHistory([]);

// When rewriteResult becomes null (deleted the open version / cleared):
setDocView('original'); setRailTab('suggestions');

// Choosing a rail tab:
//   'suggestions' → if (hasRewrite && docView !== 'original') setDocView('original')   // suggestions point at draft paragraphs
//   'change' | 'review' → if (docView === 'original' && hasRewrite) setDocView('changes')
// Choosing a doc view never changes the rail tab.
```

`instructionOpen` is deleted: the instruction field is always rendered (§5.5.2).

### 5.4 Document pane

#### 5.4.1 Toolbar (`.studio-document-toolbar`, pinned)

Left group:
- When `hasRewrite`: view switcher `.studio-view-switcher` with three `aria-pressed` buttons: `Original` (`id="view-mode-original"`), `Rewrite` (`id="view-mode-rewrite"`), `Changes` (`id="view-mode-changes"`). Clicking sets `docView`, clears selection, closes `docPanel`.
- When `!hasRewrite`: identity run `.studio-document-identity`: `Original draft` · `{n} words`. **Remove** the `Not being edited` / `Select a passage to request a change` fact (D14). The request affordance is the selection toolbar.

Right group (`.studio-document-actions`), in this order, all present whenever noted:
- `History` (icon + label, always). Toggles `docPanel === 'history'`.
- `Copy` (when `hasRewrite`). Existing `handleCopy`; label becomes `Copied` for 2 s (existing).
- `Export` (when `hasRewrite`). Existing `<details class="studio-export">` with `Plain text (.txt)` / `Markdown (.md)`.
- `Details` (when `hasRewrite`). Toggles `docPanel === 'details'`.

The `Review (n)` button is **removed from this toolbar**; review lives in the rail tab strip (§5.5.1).

#### 5.4.2 Views

- `original` — `renderProse(hasRewrite ? rewriteResult.originalText : draftText, 'draft')`: paragraphs with `id="draft-paragraph-{n}"`, class `studio-source-paragraph`, via `RichParagraph` (existing `renderDraft`). Container `data-side="original"`.
- `rewrite` — **new.** `renderProse(rewriteResult.rewrittenText, 'rewrite')`: same renderer, paragraph ids `rewrite-paragraph-{n}`, container `data-side="rewrite"`. This is the clean reading view of the result (D8). Selecting text here yields a scoped selection (§5.4.5).
- `changes` — existing `DiffViewer` (§5.4.3).
- Empty (no draft, no rewrite): `.studio-empty` with heading `Start with your draft.` and one **secondary** button `Open Draft & Brief` → `setActiveTab('draft-brief')`. (Currently only text; add the button so the way forward is a control, not prose.)

#### 5.4.3 Changes view — track-changes toolbar (`DiffViewer.tsx`)

Add a pinned toolbar as the first child of `.studio-changes`, class `studio-changes-toolbar`, `position: sticky; top: 0; background: var(--color-white); z-index: 2; border-bottom: 1px solid var(--color-neutral-200);`. It replaces the current `.studio-changes-summary` line. Contents on one baseline, left to right:

1. Count: `{remaining} of {total} changes to look at` / `All {total} changes accepted.` / `No changes.` (existing strings; singular `change` when total = 1).
2. `Previous` and `Next` (`.studio-text-button`, `aria-label="Previous change"` / `"Next change"`). Disabled when there is no unaccepted change in that direction. Implementation: the toolbar keeps `focusIndex` state; `Next` finds the first `.studio-change` whose block kind ≠ `equal` and is not accepted with index > current (wrap to first when none), calls `scrollIntoView({ block: 'center' })` on it and `focus()` (give each `.studio-change` `tabIndex={-1}`). `Previous` mirrors it.
3. `Accept all` (`.studio-text-button`). Marks every changed block accepted (extend the existing `accepted` state with all keys). Hidden when `remaining === 0`.
4. `Undo` (`.studio-text-button`), only when `canUndo` — existing behaviour (undoes the last *Keep original / Restore / Remove* text change). Keep its label; add `title="Undo the last Keep original, Restore, or Remove"`.

`.studio-compare-head` (the Original / Rewrite column labels) is already `position: sticky; top: 0`. Two sticky elements at `top: 0` overlap. Render the toolbar and the compare head as siblings inside one wrapper `div.studio-changes-header`, make the **wrapper** sticky, and remove `position: sticky` from `.studio-compare-head` and from `.studio-changes-toolbar` themselves. No pixel offsets.

Per-change actions under the rewrite column are unchanged: `Accept`, `Keep original` / `Restore` / `Remove`, `Revise`; accepted rows show `Accepted · Undo`.

`Revise` currently sets the selection and switches the rail to the edit panel. New behaviour: `onRevise(block)` → `setSelectedHighlight/Range` (existing) **and** `setRailTab('change')`. This is a click on an explicit control, so switching the tab is permitted (R4 forbids switching on *selection*, not on a button).

#### 5.4.4 History and Details panels

Unchanged in content: `RewriteHistory` (rows with `Open` / `Delete`, current row marked `· Open`) and `RewriteVersionDetails`. They render in `#studio-document-panel` over the prose, with the existing close button and Escape handling. `RewriteHistory.onOpen` now calls `setDocView('changes')` and `setRailTab(needsReview ? 'review' : 'change')` (the "new version arrived" rule handles this automatically because `rewriteResult.id` changes; keep `onOpen` only to close the panel).

#### 5.4.5 Selection toolbar — **new component** `src/components/SelectionToolbar.tsx`

Props: `{ container: React.RefObject<HTMLElement>; label: string; onAct: () => void; enabled: boolean }`.

Behaviour:
- Listens to `selectionchange` on `document` and `scroll` on `container`. When the selection is non-collapsed, entirely inside `container`, and `enabled`, it renders a single `.studio-text-button` inside an absolutely positioned `div.studio-selection-toolbar` (`position:absolute; z-index:2; background: var(--color-white); border:1px solid var(--color-neutral-300); border-radius:6px; padding:4px 10px; box-shadow: 0 4px 16px rgb(0 0 0 / 7%); user-select: none;`).
- Position: `rect = selection.getRangeAt(0).getBoundingClientRect()`; `crect = container.getBoundingClientRect()`; `top = rect.top - crect.top + container.scrollTop - 36`; `left = clamp(rect.left - crect.left + rect.width/2 - toolbarWidth/2, 8, crect.width - toolbarWidth - 8)`. If `top < container.scrollTop + 4`, place it *below* the selection instead (`rect.bottom - crect.top + container.scrollTop + 8`). `container` gets `position: relative` (`.studio-prose-scroll` already scrolls; add `position: relative` in CSS).
- **Selection collapse prevention:** The toolbar container and its action button MUST bind `onMouseDown={(e) => e.preventDefault()}`. In standard browsers, a mouse click outside the text selection clears the DOM selection on `mousedown`, which triggers `selectionchange` and unmounts the toolbar before `onClick` fires. Preventing default on `mousedown` keeps the selection intact until `onAct` completes.
- Hides when the selection collapses, on Escape, or after `onAct` fires.
- Keyboard: the button is focusable; the toolbar is `role="toolbar"` with `aria-label="Selected text"`.

Usage in `StudioView`:

| Where the selection is | `enabled` | `label` | `onAct` |
|---|---|---|---|
| `docView === 'original'` and `!hasRewrite` and `canRequest` | true | `Request a change to this passage` | existing draft-selection logic (compute `SourceSelection` via `paragraphNumber` + `paragraphSpans(draftText)` + `locateSelection`), then `setRailTab('suggestions')` and focus `#input-passage-request` |
| `docView === 'original'` and `hasRewrite` | true | `Ask for a change about this passage` | `setSelectedHighlight(text); setSelectedRange(undefined); setRailTab('change')` (reference-only selection — existing semantics) |
| `docView === 'rewrite'` | true | `Ask for a change to this passage` | locate in `rewriteResult.rewrittenText` via `paragraphSpans(rewrittenText)` and `rewrite-paragraph-{n}` ids → `setSelectedHighlight(located.text); setSelectedRange(located.range); setRailTab('change')` |
| `docView === 'changes'`, selection wholly on `data-side="rewrite"` | true | `Ask for a change to this passage` | existing block-based location → `setRailTab('change')` |
| `docView === 'changes'`, selection wholly on `data-side="original"` | true | `Ask for a change about this passage` | reference-only, as row 2 |
| anything else (mixed sides, busy, a panel open) | false | — | — |

`handleTextSelection` no longer sets any state by itself; it only feeds the toolbar. The `mouseup`/`keyup` handlers on the prose container are removed; the toolbar's `selectionchange` listener replaces them.

### 5.5 Rail

#### 5.5.1 Tab strip (`.studio-rail-tabs`, pinned, replaces `.studio-work-header`)

`<div role="tablist" aria-label="Writing workspace">` with three `<button role="tab">`:

| Tab | Label | id | `aria-selected` | Availability |
|---|---|---|---|---|
| suggestions | `Suggestions` | `rail-tab-suggestions` | `railTab === 'suggestions'` | always |
| change | `Ask for a change` | `rail-tab-change` | `railTab === 'change'` | `hasRewrite`; otherwise `aria-disabled="true"` `title="Available after the first rewrite"` |
| review | `Review` + count badge when `attentionCount > 0` (`Review (4)`), or `Review · failed` when `review?.status !== 'complete'` | `rail-tab-review` | `railTab === 'review'` | `hasRewrite`; same disabled treatment |

Styling: the existing `.studio-view-switcher` segmented style (hairline container, quiet selected fill, weight 600) — reuse the class; if it needs to stretch full width add a modifier `.studio-rail-tabs .studio-view-switcher { display:flex; } .studio-rail-tabs button { flex:1; }`. Disabled tabs use `color: var(--color-neutral-400); cursor: not-allowed`.

Keyboard: Left/Right arrows move between enabled tabs (standard tablist). Each tab controls a `div[role="tabpanel"]`.

The old `Back to the rewrite` links (both) are **deleted**; the tabs replace them.

#### 5.5.2 Suggestions tab

Structure, top to bottom. Items marked *pinned* live in `.studio-work-action`-style fixed area **above** the scroll region (move the action container from the bottom to the top of the tab and rename the class to `.studio-rail-actions`).

**A. Action bar (pinned)** — `div.studio-rail-actions`:

Row 1, two buttons on one line:
- `#btn-rewrite` — **primary** (`.studio-primary`). Label `Rewrite`. While `isRewriting`: spinner + `Rewriting…`. `disabled` when `busy || !hasDraft || !plan || planStale || Boolean(planIssue)`. `onClick`: `performRewrite(planApproved ? undefined : approveEditorialPlan())`, then focus `#rewrite-result`. Errors → `rewriteError`.
- `#btn-get-suggestions` — **secondary** (`.studio-secondary`). Label `Get suggestions` when `!plan`, `Get new suggestions` when `plan`. While `isPlanning`: spinner + `Reading your draft…`. `disabled` when `busy || !hasDraft`. `onClick`: clears `rewriteError` via `setRewriteError(null)`, then calls `generateEditorialPlan()` (this is unconditional — D2 is fixed by this line). Errors captured to `rewriteError` (fallback `'Could not get suggestions. Your current work is still available.'`). On success, scrolls the tab's scroll region to top and focuses the tab panel heading.

Row 2, one status line `<p role="status" class="studio-rail-status">` (or `role="alert"` + `.studio-error` for Priority 5 below). Exactly one sentence, first match wins:

| Priority | Condition | Text |
|---|---|---|
| 1 | `!hasDraft` | `Add your draft in Draft & Brief to begin.` followed by an inline text button `Open Draft & Brief` → `setActiveTab('draft-brief')` |
| 2 | `isPlanning` | `Reading your draft and brief…` |
| 3 | `isRewriting` | `Writing and reviewing…` |
| 4 | `isUploadingDraft \|\| isUploadingBrief` | `Waiting for your upload…` |
| 5 | `rewriteError` | the error text (`role="alert"`, rose) |
| 6 | `!plan` | `Get suggestions first. The rewrite follows the suggestions you accept.` |
| 7 | `planStale && staleReasons.length > 0` | `Your {staleReasons.join(', ')} changed after these suggestions were prepared. Get new suggestions before rewriting.` |
| 7b | `planStale` (no reasons — plan is in the older per-paragraph format) | `These suggestions are in an older format. Get new suggestions before rewriting.` |
| 8 | `planIssue` | `planIssue` verbatim (these strings already exist in `planReadiness`) |
| 9 | `planApproved && hasRewrite` | `The last rewrite followed these suggestions. Rewrite writes a new version from the original draft.` |
| 10 | `pending > 0` | `pending === 1 ? '1 unanswered suggestion will be accepted when you rewrite.' : `${pending} unanswered suggestions will be accepted when you rewrite.`` |
| 11 | otherwise | `Ready to rewrite.` |

**B. Scroll region** (`.studio-inspector-scroll`), in order:

1. **Instruction field** — always rendered when `hasDraft`. `div.studio-field`: label `Anything the suggestions and the writer should take into account? (optional)` for `#input-rewrite-instructions`; `textarea rows={1}` that grows (existing auto-grow behaviour, see `DESIGN.md` §4 inputs), value `customDirectives`, `onChange → setCustomDirectives`, `disabled={busy}`. Placeholder `For example, keep it under 500 words.` Changing it makes the plan stale (existing `planStaleReasons` includes `rewrite instructions`) and the status line (priority 7) tells the user what to do. Delete `instructionOpen` and the `Ask for different suggestions` link.

2. **Writing settings** — `<details class="studio-settings">` (uses the existing `.studio-inspector summary` +/− marker). `<summary>` text is the existing one-line summary from `StudioDraftControls`: `Balanced rewrite · protecting numbers, direct quotes, section order`. Body: the existing fieldset (`How much should change?` select; `Keep unchanged` checkboxes incl. `Heading wording`; `Anything else to protect?` textarea / `Protect specific text`; the `Your standing preferences are included. Edit in Draft & Brief` note). Remove the `Change` and `Done` buttons — the `<summary>` is the toggle. The blueprint-stale notice (`Your voice blueprint needs updating. Review blueprint`) renders **above** this `<details>` as `.studio-inline-notice`, not inside it.

3. **Stale notice** — when `planStale`: `.studio-notice.is-warning` with the same text as status priority 7. (Also shown in the status line; the notice sits above the list it invalidates — R7.) Existing element in `EditorialDecisions`; keep it there.

4. **Passage request composer** — rendered when `sourceSelection` is set (after the user clicked the selection toolbar): existing `.studio-request-form` (header `Rewrite this passage`, quote, `#input-passage-request` textarea, `Add request` secondary + `Cancel` text).

5. **Suggestions** — `EditorialDecisions` as it exists after the v4 work (conflict question → `Your requests` → `Opening` → one `<details>` per section). Add one line above the first section group, class `studio-note-summary`: `{answered} of {total} suggestions answered` · `Accept all` (text button, only when `pending > 0` and `!readOnly`). `Accept all` sets `response: 'accepted'` on every item that renders answer controls and has no response, via `editEditorialPlan`. When `plan.approved`, the existing notice `These are the suggestions the last rewrite followed.` stays at the top of this block.

6. **Empty state** — when `!plan && hasDraft`: one paragraph `.studio-panel-description`: `Suggestions show what the rewrite would keep, shorten, or cut, one passage at a time. You answer them before rewriting.`

Everything that used to be at the **bottom** of this panel (`Ask for different suggestions`, `StudioDraftControls` summary + `Change`, the primary button, the status line) is now covered by A and B above. Nothing remains at the bottom.

#### 5.5.3 Ask for a change tab (`RewriteFeedbackManager.tsx`)

Rendered only when `hasRewrite` (`key={rewriteResult.id}` as today). Reorder so the composer and its action are at the **top**:

1. **Selected passage** (when `selectedText`): existing `.studio-selection` block — heading `Selected passage` / `Selected in the original draft`, `Clear` text button, blockquote, and (when `canScope`) the `Change: ◉ This passage only ○ The whole draft` radios.
2. **Composer**: label `What should change?`, `#input-edit-request` textarea rows 4, existing placeholder, Ctrl/Cmd+Enter submits.
3. **Apply** — **primary** `#btn-apply-changes`, label `Apply`, busy: spinner + `Applying…`. `disabled` when `busy || (!customNote.trim() && !settingsChanged)`. Directly under the textarea, left-aligned, in a `.studio-rail-actions` row together with the scope status text `Only the selected passage will change.` / `The whole draft may change; the selection is the reference.` (existing strings) to its right.
4. **Save as style rule** checkbox (when `preferenceLike`): unchanged text.
5. **Voice save status** and **failed notes** blocks: unchanged.

Delete `Start a new rewrite from the original draft` and the `onStartOver` prop — the Suggestions tab is always one click away and its status line (priority 9) explains that `Rewrite` writes a new version from the original draft.

Errors: existing `error` paragraph renders directly under the Apply row.

#### 5.5.4 Review tab

`WritingReviewPanel` unchanged (status sentence; findings with `Edit this issue` / `Mark reviewed`; `Text checks (n)` details with `Compare sources`; `Review details`). Wiring:
- `onRequestEdit(instruction)` → `setRailTab('change')` and set `editRequest` (existing).
- `onCompareSources()` → `setDocView('changes')`.
- `onConfigureReviewer()` → `openModelSettings('analysis')` (existing).
- When `!review`: `.studio-panel-description` `No review is saved with this version. Compare it with the original before using it.` (existing).

### 5.6 Why the coupling rules exist

- Suggestions point at `#draft-paragraph-{n}` (hover highlight, request quoting). Those ids exist only in the `original` view. Hence selecting the Suggestions tab shows the original.
- `Ask for a change` and `Review` act on the rewrite. If the user is looking at the original with no rewrite on screen, the request has no visible target. Hence they switch to `changes` (never to `rewrite`, so the user can always see what the change did).
- A doc-view change never changes the rail tab, so reading the clean `Rewrite` view while the Review tab is open is allowed.

### 5.7 Copy table — Studio

Every user-visible string in Studio after this change. Strings not listed here are unchanged from the current code.

| Element | Text |
|---|---|
| View switcher | `Original` · `Rewrite` · `Changes` |
| Toolbar actions | `History` · `Copy` / `Copied` · `Export` · `Details` |
| Export options | `Plain text (.txt)` · `Markdown (.md)` |
| Changes toolbar | `{n} of {m} changes to look at` · `Previous` · `Next` · `Accept all` · `Undo` |
| Per-change actions | `Accept` · `Keep original` / `Restore` / `Remove` · `Revise` · `Accepted` · `Undo` |
| Empty document | heading `Start with your draft.` · button `Open Draft & Brief` |
| Selection toolbar | `Request a change to this passage` / `Ask for a change to this passage` / `Ask for a change about this passage` |
| Rail tabs | `Suggestions` · `Ask for a change` · `Review` / `Review (n)` / `Review · failed` · disabled title `Available after the first rewrite` |
| Suggestions actions | `Rewrite` / `Rewriting…` · `Get suggestions` / `Get new suggestions` / `Reading your draft…` |
| Suggestions status | see §5.5.2 table |
| Instruction field | label `Anything the suggestions and the writer should take into account? (optional)` · placeholder `For example, keep it under 500 words.` |
| Writing settings summary | `{Light\|Balanced\|Thorough} rewrite · protecting {list}` / `· nothing protected` |
| Suggestions summary line | `{answered} of {total} suggestions answered` · `Accept all` |
| Suggestions empty | `Suggestions show what the rewrite would keep, shorten, or cut, one passage at a time. You answer them before rewriting.` |
| Ask tab | `Selected passage` / `Selected in the original draft` · `Clear` · `Change` · `This passage only` · `The whole draft` · `What should change?` · `Apply` / `Applying…` |
| Ask tab status | `Only the selected passage will change.` · `The whole draft may change; the selection is the reference.` |

### 5.8 File-by-file changes

**`src/components/StudioView.tsx`** — rewrite the component body around the §5.3 state model.
- Delete: `panel`, `viewMode`, `instructionOpen`, `openPanel`, `showingRewrite`, `draftStatus`, the morphing primary button and its label expression, the `Back to the rewrite` buttons, the mouse/key selection handlers on the prose container, `startRewrite`'s branch on `planStale`.
- Add: `railTab`, `docView`, `docPanel`; `renderProse(text, side)` generalising `renderDraft`; the `rewrite` view; `SelectionToolbar` usage with the §5.4.5 table; the tab strip; per-tab panels; `getSuggestions()` = `generateEditorialPlan()` wrapper with error capture; `rewrite()` = `performRewrite(...)` wrapper with error capture; the status-line selector as a pure function `suggestionsStatus(input: StudioStatusInput): StudioStatusResult` exported from a new `src/utils/studioStatus.ts` so it is unit-testable.
- Keep: copy/export/download, history/details panels and their focus management, `keepOriginal`/`undoKeepOriginal`/`reviseBlock`, `addRequest`, `requestCorrection`, `blocks` memo, the `rewriteResult.id` effect (updated per §5.3).

**`src/components/DiffViewer.tsx`** — add the sticky toolbar with Previous/Next/Accept all (§5.4.3); give `.studio-change` sections `tabIndex={-1}`; remove `.studio-changes-summary`.

**`src/components/RewriteFeedbackManager.tsx`** — reorder per §5.5.3; remove `onStartOver` and the start-over button; move the Apply button under the textarea; label `Apply`.

**`src/components/StudioDraftControls.tsx`** — becomes the `<details class="studio-settings">` described in §5.5.2; remove `open` state, `Change`, `Done`; the blueprint notice is returned as a sibling above the details (return a fragment).

**`src/components/EditorialDecisions.tsx`** — add the summary line with `Accept all` (§5.5.2 B5) and an `acceptAllPending` handler. No other change.

**`src/components/SelectionToolbar.tsx`** — new (§5.4.5).

**`src/utils/studioStatus.ts`** — new; pure function for the status line (§5.5.2 A row 2) with the priority table encoded once:
```ts
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

export function suggestionsStatus(input: StudioStatusInput): StudioStatusResult;
```

**`src/context/WritingAssistantContext.tsx`** — no change required. (Optional, additive: none.)

**`src/index.css`** — see §5.9.

### 5.9 CSS additions (`src/index.css`)

Reuse existing tokens. Add only:

```css
.studio-rail-tabs { padding: 12px 20px 0; }
.studio-rail-tabs .studio-view-switcher { display: flex; }
.studio-rail-tabs .studio-view-switcher > button { flex: 1; }
.studio-rail-tabs [aria-disabled="true"] { color: var(--color-neutral-400); cursor: not-allowed; }
.studio-rail-actions { display: grid; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--color-neutral-200); }
.studio-rail-actions > div { display: flex; gap: 10px; align-items: center; }
.studio-rail-status { margin: 0; font-size: 12px; line-height: 1.6; color: var(--color-neutral-600); }
.studio-changes-header { position: sticky; top: 0; z-index: 2; background: var(--color-white); }
.studio-changes-toolbar { display: flex; align-items: baseline; gap: 14px; padding: 10px 0; background: var(--color-white); border-bottom: 1px solid var(--color-neutral-200); font-size: 13px; }
.studio-changes-toolbar > span:first-child { margin-right: auto; }
.studio-compare-head { position: static; } /* the wrapper is sticky now */
.studio-prose-scroll { position: relative; }
.studio-selection-toolbar { position: absolute; z-index: 2; background: var(--color-white); border: 1px solid var(--color-neutral-300); border-radius: 6px; padding: 4px 10px; box-shadow: 0 4px 16px rgb(0 0 0 / 7%); user-select: none; }
.studio-note-summary { display: flex; align-items: baseline; justify-content: space-between; font-size: 12px; color: var(--color-neutral-600); }
.studio-settings > summary { font-size: 12px; color: var(--color-neutral-600); }
```

Remove rules that no longer have consumers after the rewrite: `.studio-work-header`, `.studio-start-over`, `.studio-settings-summary`, `.studio-changes-summary`, `.studio-rewrite-request` (grep before deleting; keep any still referenced).

### 5.10 Tests

Existing tests must keep passing. Add:

- `tests/studioStatus.test.ts` — one case per priority row in §5.5.2 (11 cases) plus one proving priority order (e.g. `planStale` beats `pending > 0`).
- `tests/diffToolbar.test.ts` — render `DiffViewer` to static markup with `renderToStaticMarkup` from `react-dom/server` (the pattern is in `tests/richText.test.ts`): toolbar present with counts; `Accept all` absent when nothing remains; `Previous`/`Next` present when > 1 change.
- `tests/studioView.test.ts` — static render of `StudioView` through the real provider with three workspace fixtures (no draft; draft + v4 unapproved plan; draft + approved plan + rewrite with review findings). Assert: tab strip has three tabs with the right `aria-disabled`; the primary button label is always `Rewrite`; the secondary is `Get suggestions` / `Get new suggestions`; the status line text per fixture; no element containing `Start a new rewrite`, `Ask for different suggestions`, `Back to the rewrite`, `Rewrite from source`, `Accept all and rewrite`, or `Suggest changes`.
- Extend `tests/editorialSummary.test.ts` only if `sectionPlan().pending` semantics are touched (they should not be).

### 5.11 Acceptance checklist — rendered (port 3100, real browser)

Use a fixture workspace in `localStorage['personascript_workspace_v1']` (shape: `src/utils/studioWorkspace.ts`). Walk each row; report pass/fail per row.

1. No draft: document shows `Start with your draft.` + `Open Draft & Brief`; rail shows tabs (two disabled) and the action bar with `Rewrite` disabled, `Get suggestions` disabled, status priority 1.
2. Draft, no plan: `Get suggestions` enabled; `Rewrite` disabled; status priority 6; instruction field and writing-settings `<details>` visible; suggestions empty paragraph visible.
3. Draft + v4 unapproved plan with 2 pending: `Rewrite` enabled; status priority 10 with `2`; summary line `x of y suggestions answered · Accept all`; clicking `Accept all` → pending 0, status priority 11.
4. Type in the instruction field → status priority 7 naming `rewrite instructions`; `Rewrite` disabled; `Get new suggestions` enabled. Clear the text → back to priority 10/11.
5. Select text in the draft → toolbar `Request a change to this passage` appears above the selection; nothing else changes. Click it → request composer appears at the top of the Suggestions scroll region with the quote; `Add request` adds a row under `Your requests`.
6. Plan approved + rewrite present: document opens on `Changes`; rail on `Review` if findings else `Ask for a change`; tabs all enabled; Suggestions tab shows the followed suggestions read-only with status priority 9; `Get new suggestions` enabled.
7. `Changes` view: sticky toolbar with count, `Previous`/`Next`, `Accept all`; `Next` scrolls and focuses the next unaccepted change; `Accept all` → `All n changes accepted.`
8. `Rewrite` view: clean prose, no marks; select text → toolbar `Ask for a change to this passage`; click → rail `Ask for a change`, text quoted, scope radios present, `Apply` directly under the textarea.
9. `Original` view with a rewrite present: select → `Ask for a change about this passage`; click → rail `Ask for a change`, heading `Selected in the original draft`, no scope radios.
10. Review tab: `Edit this issue` → rail switches to `Ask for a change` with the instruction prefilled; `Compare sources` → document `Changes`.
11. History: `Open` on another version → document `Changes`, rail per rule; `Delete` on the open version → document `Original`, rail `Suggestions`.
12. No string from the removed list (§5.10 third bullet) appears anywhere in the DOM.
13. Exactly one black button visible in the rail at any time.
14. Keyboard: Tab reaches the tab strip; Left/Right switches tabs; Escape dismisses the selection toolbar; focus returns to the view-switcher button when a document panel closes.

---

## 6. Writing Samples (`src/components/SamplesView.tsx`)

### 6.1 Brief
- **Job:** collect enough of my writing and build the voice blueprint from it.
- **Object:** *samples* (a list) and, as the outcome, the *voice blueprint*.
- **Done when:** the blueprint has been built from the enabled samples.

### 6.2 Structure

Header row: `Step 1 of 5` micro-label, `Writing Samples` h1, description `Add your writing, then build the voice blueprint from the samples you enable.` Right side, exactly two buttons:

| Button | Style | id | Behaviour |
|---|---|---|---|
| `Build voice blueprint ({activeSamplesCount})` | **primary** | `btn-synthesize-profile` | `await synthesizeProfileFromActiveSamples()`; **do not navigate** (D10). On success set `successNotice = 'Voice blueprint built from {n} samples.'` and render a `.studio-inline-notice`-equivalent success band under the header with an inline text button `Open Voice Blueprint` → `setActiveTab('profile')`. On error, existing `#banner-sample-error`. Busy: spinner + `Building blueprint…`. Disabled when `isSynthesizingProfile || activeSamplesCount === 0`; when disabled for zero samples add `title="Enable at least one sample first"`. |
| `Add samples` | **secondary** | `btn-open-upload-modal` | opens `UploadModal` (unchanged) |

Remove the header `Continue to Voice Blueprint` and the detail-column bottom `Continue to Voice Blueprint`. Add the step footer (§4.3).

Two-column body unchanged: list column (enabled checkbox, title, type · words, analysing indicator, delete icon, analysis summary) and detail column (title, `Re-analyze` / `Analyze sample` / `Cancel analysis`, `Delete`, `StyleSimilarityCard`, analysis sections). Two changes:
- The list-row trash icon gets `aria-label="Delete {title}"` (it currently has only `title`).
- Empty state keeps `Add sample` (primary here, because nothing else is on screen) and `Load example samples` (text button).

`UploadModal` (`Upload files` / `Web link` / `Paste text`; `WebImportTab` with `Single Article` / `Portfolio Discovery`) and `DeleteConfirmModal` are unchanged.

### 6.3 Acceptance
1. One black button in the header (`Build voice blueprint`); `Add samples` is white.
2. Building the blueprint stays on this page and shows the success band with the link; the Blueprint tab is not auto-selected.
3. Footer `Next: Voice Blueprint →` present, white, right-aligned.

---

## 7. Voice Blueprint (`src/components/ProfileView.tsx`)

### 7.1 Brief
- **Job:** check and adjust how the writer will sound.
- **Object:** the *voice blueprint* (one profile).
- **Done when:** the blueprint reflects the samples and any adjustments are saved (autosave).

### 7.2 Structure

Header: `Step 2 of 5` micro-label; h1 `{activeProfile.name}`; description. Right side, exactly one button:

| Button | Style | id | Behaviour |
|---|---|---|---|
| `Rebuild from samples` | **secondary** | `btn-rebuild-profile` | `synthesizeProfileFromActiveSamples()` with the same busy/disabled/error handling as §6.2; success notice `Blueprint rebuilt from {n} samples.` |

There is **no primary** on this page: its job is adjustment, and every adjustment autosaves. (R6 permits zero primaries; it forbids two.)

Directly under the header, when `!hasFreshProfileGuidance(activeProfile, enabledSamples)`: `.studio-inline-notice` `Your writing samples changed after this blueprint was built. Rebuild it so the writer follows your current samples.` — this is the notice that today lives only inside Studio's writing settings; it stays in Studio too (§5.5.2 B2) but its home is here.

Body order (unchanged content):
1. Voice manifesto quote.
2. **Style metrics** — sliders always editable (D11). Remove `isEditing`, `profileForm`, `#btn-toggle-edit-profile` (`Adjust` / `Save`), `handleSave`. Each `<input type="range">` writes through `updateActiveProfile({ ...activeProfile, metrics: { ...activeProfile.metrics, [key]: value } })` on `onChange` (this already autosaves through the context's persistence). Show `{value}/100` beside each label as now. Add one caption under the grid: `Saved automatically.` (the same caption `Additional style rules` already uses).
3. **Tone for new writing** — unchanged (enable checkbox, sliders, `Reset tone`).
4. Stylistic rules / Patterns to avoid; Writing habits / Preferred phrasing / Pacing guide — unchanged.
5. **Additional style rules** textarea — unchanged (`Saved automatically`).
6. Step footer `Next: Draft & Brief →` (§4.3). Remove `#btn-profile-to-draft-brief` (header) and `#btn-profile-next-draft-brief` (bottom); the footer button reuses id `btn-profile-to-draft`.

### 7.3 Acceptance
1. No `Adjust`/`Save` toggle; dragging a metric slider changes the value and survives reload.
2. Zero black buttons on the page; `Rebuild from samples` is white and disabled with a title when no sample is enabled.
3. The stale-samples notice appears when a sample is added/removed after the last build and disappears after rebuilding.

---

## 8. Draft & Brief (`src/components/DraftBriefView.tsx`)

### 8.1 Brief
- **Job:** give the writer the draft and what it must know about the reader and the brief.
- **Object:** the *draft*; three optional supporting texts.
- **Done when:** the draft is in and the optional fields say what they need to.

### 8.2 Structure

Header: `Step 3 of 5`, h1 `Draft & Brief`, description. **No buttons in the header** (remove `#btn-draft-brief-to-domain` from the header; the footer has it).

Cards, in the existing order and with the existing controls:
1. **Original draft** — `Load sample` (text), `Upload` (secondary), `Clear` (text, only when non-empty); textarea `#textarea-draft-input`; counter `{words} words · {chars} characters`.
2. **Project brief (optional)** — `Upload`, `Clear`; help text; textarea; counter now `{chars} / {PROJECT_BRIEF_MAX_CHARS}` (over-limit error unchanged).
3. **Reader and purpose (optional)** — `Clear`; help; textarea; counter `{chars} / {READER_PURPOSE_MAX_CHARS}`.
4. **Standing preferences (optional)** — `Clear`; help; textarea; counter `{chars} / {EDITORIAL_PREFERENCES_MAX_CHARS}`.

`Upload` is the only button-styled control in card 1 and is **secondary**; there is no primary on this page (the job is data entry; the next action is the footer).

Footer `Next: Domain Knowledge →` (§4.3), id `btn-draft-brief-to-domain`.

### 8.3 Acceptance
1. Header has no buttons; footer has the one white `Next` button.
2. Counters show `n / max` on the three limited fields.
3. Upload, clear, and sample-load behave as before (upload error text unchanged).

---

## 9. Domain Knowledge (`src/components/DomainView.tsx`)

### 9.1 Brief
- **Job:** tell the writer which fields, concepts, and products it must get right.
- **Object:** *domain knowledge* — one switch, a list of topics, a list of products, and free-text guidance.
- **Done when:** knowledge is on, the topics are the ones I want, and nothing wrong is enabled.

### 9.2 Structure (top to bottom)

**Header:** `Step 4 of 5`, h1 `Domain Knowledge` (drop `& Product`; products are a section below), description. Right side: **no buttons**. The `Knowledge enabled/off` pill and the `Saved` flash are removed from the header; the switch row below replaces the pill, and `Saved` moves next to whatever autosaves (render the existing `savedFeedback` flash at the end of the switch row).

**Switch row** (first body block, full width, hairline-bordered): checkbox `#toggle-domain-enable` with label `Use this knowledge in rewrites` and sublabel `Off means the writer ignores every topic and product below.`; `Saved` flash to the right. This puts the master control immediately above what it governs (D12).

**Overview bar** — the four summary tiles (disciplines, topics, products, terms) unchanged; they are read-only and sit under the switch.

**Section 1 — Fields and audience.** Title `Fields and audience`. Chips of disciplines with remove ×, add-discipline input `#input-new-discipline` + `Add` button, `Audience context` textarea `#input-domain-audience`. Unchanged apart from the title.

**Section 2 — Topics.** Title `Topics`, count `({enabledCount} of {total} enabled)`. Section header actions, left to right, on one line:
- `Generate topics` / `Regenerate topics` — **primary** `#btn-regenerate-topics` (label depends on whether topics exist — this is the one label change permitted because it reflects the *object's* state, not a hidden flag; the button is always present). Busy: `Generating…`. Directly right of it, the checkbox `#checkbox-use-draft-brief` `Use my draft and brief` with the existing `Edit in Draft & Brief` text link `#btn-link-edit-draft-brief`. (The option that governs generation sits beside the Generate button — R7.)
- `Add topic` — **secondary** `#btn-open-add-topic`. Toggles the add-topic form (unchanged fields: Topic name, Category, Short description, Concept examples, Conventions & rules; `Cancel` / `Save topic`).
- `Clear all topics` — **text button, rose**, `#btn-clear-topics`, right-aligned with `margin-left:auto`, `window.confirm('Remove all topics? This cannot be undone.')` before acting. Separated from the generative controls.

Generation error band with `Dismiss` — unchanged, rendered directly under the header row.

Empty state (no topics): one paragraph and one `Generate topics` button (this is the same primary; do not render a second one in the header while the empty state shows — render it in one place only).

**Topic card** (depth 1). Header row: enable checkbox, name, category pill, and a `<details>` marker. Summary line (visible when collapsed): term count, convention count. Actions in the card header, right side: `Regenerate` (text), `Clear` (text, `window.confirm`), `Delete` (text, rose, `window.confirm`). Card body (depth 2, inside the `<details>`): term chips with ×, add-concept input + `Add`; conventions list with per-row × and `Add rule` input. The `+N more` truncation is removed (the body is behind the disclosure already; truncating inside a disclosure is a third level).

**Section 3 — Products.** Title `Products`. Header action `Add product` (secondary, `#btn-add-product`). Per product: enable checkbox, name input, `Reference notes` textarea, `Remove` (text, rose, `window.confirm`). Empty state text with the same `Add product` button (render once).

**Section 4 — Domain guidance.** Textarea, unchanged.

Footer `Next: Rewrite Studio →` (§4.3), id `btn-domain-to-studio`.

### 9.3 Code hygiene
- Delete `src/components/DomainExpertiseEditor.tsx` (no importers; verify with grep before deleting).
- Split `DomainView.tsx` (1340 lines) into `DomainView.tsx` (page, switch, footer), `DomainTopicsSection.tsx`, `DomainProductsSection.tsx`. Behaviour identical; this is to make the structure above reviewable. Keep all handler names.

### 9.4 Acceptance
1. One black button on the page (`Generate topics`/`Regenerate topics`); `Clear all topics` is a rose text button and confirms.
2. Topic card: closed shows counts; open shows terms and conventions; there is no `+N more`.
3. Switch row is the first body block; turning it off greys the topic and product sections (add `aria-disabled` + `opacity-50` on the sections, controls still operable — this is display only, matching the current behaviour where edits are allowed while off).
4. Footer `Next: Rewrite Studio →`.

---

## 10. Functionality ledger

Every control that exists today and where it lives after this work. **A row may be struck only by Mason.** "Same" = same component, same behaviour.

### 10.1 Header / global
| Today | After |
|---|---|
| Brand, nav tabs with count | Same |
| Model selector (roles, provider, model, reasoning, API connections) | Same |
| Profile name | Same |
| Reset icon (`btn-reset-demo`) + confirm modal | Labelled `Reset presets`, same id, same modal (§4.1) |
| Save-status banner + `Download working copy` | Same (§4.4) |

### 10.2 Studio — document
| Today | After |
|---|---|
| View switcher Original / Changes | Original / **Rewrite** / Changes (§5.4.1) |
| Identity `Original draft · n words · Not being edited / Select a passage…` | `Original draft · n words` (status fact removed; the selection toolbar is the affordance) |
| `Review (n)` / `Not reviewed` / `Review failed` / `Review differences` toolbar button | Rail tab `Review` / `Review (n)` / `Review · failed` (§5.5.1) |
| `History` button → version list (Open / Delete) | Same |
| `Details` → version details | Same |
| `Copy` / `Copied` | Same |
| `Export` → .txt / .md | Same |
| Empty state text | + `Open Draft & Brief` button |
| Prose paragraphs `#draft-paragraph-n`, hover highlight | Same, in Original view |
| DiffViewer summary line + Undo | Sticky toolbar: count · Previous · Next · Accept all · Undo (§5.4.3) |
| Per-change Accept / Keep original / Restore / Remove / Revise / Accepted·Undo | Same |
| Select text → rail switches automatically | Select text → floating toolbar → click → rail switches (§5.4.5) |

### 10.3 Studio — rail
| Today | After |
|---|---|
| Rail modes source / edit / review (hidden) | Tabs Suggestions / Ask for a change / Review (§5.5.1) |
| `Back to the rewrite` (×2) | Removed; tabs replace |
| Morphing primary (`Suggest changes` … `Add draft`) | `Rewrite` (primary, stable) + `Get suggestions` / `Get new suggestions` (secondary) (§5.5.2 A) |
| Status line under the button | Status line under the buttons, 11 explicit cases |
| `Ask for different suggestions` link → reveals instruction field | Instruction field always visible; link removed |
| Instruction textarea `#input-rewrite-instructions` | Same id, always visible |
| `StudioDraftControls` summary + `Change` → fieldset + `Done` | `<details>` with the summary as its toggle; same fields |
| Blueprint-stale notice | Above the settings details (Studio) **and** on Voice Blueprint |
| Passage request composer (`#input-passage-request`, Add request, Cancel) | Same, top of Suggestions scroll region |
| `EditorialDecisions` (conflict question, requests, opening, sections, Accept/Reject/Ignore/Undo, Do not go beyond, Unchanged) | Same + summary line with `Accept all` |
| Approved-plan notice | Same |
| Stale-plan notice | Same |
| `RewriteFeedbackManager`: selection block (`Selected passage`, scope radios `This passage only` / `The whole draft`), `What should change?`, style-rule checkbox, voice status, failed notes | Same content; Apply moves under the textarea (§5.5.3) |
| `Apply changes` | `Apply` (same id) |
| `Start a new rewrite from the original draft` | Removed; `Rewrite` on the Suggestions tab is that action and its status line says so |
| `WritingReviewPanel` (findings, Edit this issue, Mark reviewed, Text checks, Compare sources, Review details, Change reviewer) | Same, in the Review tab |
| Error line (`rewriteError`) | Status line priority 5 |

### 10.4 Writing Samples
| Today | After |
|---|---|
| `Add samples` (primary) | Secondary |
| `Analyze Voice Profile (n)` (secondary) → auto-navigates | `Build voice blueprint (n)` (primary), stays on page with success band + link |
| `Continue to Voice Blueprint` (header + bottom) | Footer `Next: Voice Blueprint →` |
| Sample list, checkbox, delete, analysis, detail column, Re-analyze / Analyze / Cancel, Delete, similarity card | Same |
| Upload modal (files / link / paste; single article / portfolio discovery), delete confirm | Same |
| Empty state (Add sample, Load example samples) | Same |

### 10.5 Voice Blueprint
| Today | After |
|---|---|
| `Adjust` / `Save` toggle | Removed; sliders always live and autosave |
| `Continue to Draft & Brief` (header + bottom) | Footer `Next: Draft & Brief →` |
| — | `Rebuild from samples` (new secondary; the action existed only on Samples) |
| — | Stale-samples notice (existed only in Studio) |
| Manifesto, metrics, tone sliders + Reset tone, rules/patterns/habits/phrasing/pacing, Additional style rules | Same |

### 10.6 Draft & Brief
| Today | After |
|---|---|
| `Continue to Domain Knowledge` header | Footer `Next: Domain Knowledge →` |
| Load sample / Upload / Clear; brief Upload / Clear; reader Clear; preferences Clear; textareas; help; limits | Same; counters show `n / max` |

### 10.7 Domain Knowledge
| Today | After |
|---|---|
| `Continue to Rewrite Studio` header | Footer `Next: Rewrite Studio →` |
| `Knowledge enabled/off` pill | Removed; switch row shows state |
| `Active in rewrites` checkbox (header) | Switch row `Use this knowledge in rewrites` (first body block) |
| `Saved` flash | End of switch row |
| Overview tiles | Same |
| Disciplines chips/add, audience textarea | Same (section title `Fields and audience`) |
| Generate / Regenerate, `Use draft and brief` checkbox + link, Clear all, Add topic toggle + form, error dismiss | Same controls, arranged per §9.2 (option beside Generate; Clear all separated + confirm) |
| Topic card: enable, expand, Delete, Regenerate, Clear, term chips/add, conventions add/remove, `+N more` | Same except `+N more` removed (body already disclosed) |
| Add product / product enable / name / remove / notes | Same; `Remove` confirms |
| Domain guidance textarea | Same |
| `DomainExpertiseEditor.tsx` (unreferenced) | Deleted |

---

## 11. Implementation order

Each slice ends with lint, test, a rendered check on port 3100, and a report (§12). Do not merge slices.

1. **Slice 1 — Studio state and rail tabs.** §5.3 state model; tab strip; Suggestions tab action bar + status (`studioStatus.ts` + tests); instruction field always on; settings `<details>`; remove morphing button, links, back buttons. `RewriteFeedbackManager` reorder + `Apply`. Review tab wiring. Acceptance §5.11 rows 1–4, 6, 10, 12, 13.
2. **Slice 2 — Document pane.** `Rewrite` view; DiffViewer sticky toolbar with Previous/Next/Accept all; `Open Draft & Brief` in the empty state; toolbar changes. Acceptance rows 7, 11.
3. **Slice 3 — Selection toolbar.** `SelectionToolbar.tsx`, the §5.4.5 usage table, removal of auto-switching. Acceptance rows 5, 8, 9, 14.
4. **Slice 4 — Steps 1–4.** §4.3 footers; §6, §7, §8, §9 including the DomainView split and dead-file deletion. Acceptance §6.3, §7.3, §8.3, §9.4.
5. **Slice 5 — Docs and CSS cleanup.** §13; remove orphaned CSS (§5.9 last paragraph); final full acceptance pass of §5.11 and §10 ledger walk (open every row's "After" location and confirm the control is there).

Minor fixes to fold into Slice 1 (known, from QA):
- `.studio-note-state { white-space: nowrap; }` so `1 change` does not wrap under long section headings.
- `sectionPlan` (group naming) in `src/utils/editorialSummary.ts`: when two items begin at the same paragraph and both would take the section's name, suffix the second with its opening quotation (`Section name — "first words…"`). Add a test.
- Legacy plans with `version` undefined render no section groups in `sectionPlan`; render them as one group titled `Suggestions` so nothing is invisible. Add a test.

---

## 12. Verification and reporting

### 12.1 Commands
- `npm run lint`
- `npm test`
- `npm run build` (once, at the end of Slice 5)
- Own server for rendered checks: `PORT=3100 DISABLE_HMR=true npm run dev` — stop it when done. **Never** start, stop, or reload anything on port 3000.

### 12.2 Fixtures
Create `tests/fixtures/studioWorkspace.ts` exporting three workspace objects for `localStorage['personascript_workspace_v1']` (empty; draft + v4 plan with two pending and one limit; approved plan + rewrite with two review findings). Reuse them in `tests/studioView.test.ts` and, via the browser console, for the rendered checks. Delete any ad-hoc fixture from the browser's storage when finished.

### 12.3 Report format (per slice)
```
Slice N — <name>
Changed: <files>
Removed strings: <list>  (must match §5.10 removal list for Slice 1)
Lint: clean | <errors>
Tests: <pass>/<total> (baseline 234)
Rendered (3100): row-by-row from the slice's acceptance list — pass/fail + one line of evidence each
Ledger rows touched: <§10 row ids> — each confirmed present at its "After" location
Unverified: <anything you could not check and why>
Deviations from spec: <none | list with reason>
```

Report a deviation before making it if it changes a label, removes a control, or adds a state. Small implementation choices (hook structure, helper names) need no approval.

---

## 13. Documentation to update (repository-owned sources)

- `README.md` — "Rewrite Studio" section: tabs (Suggestions / Ask for a change / Review), the three document views, the stable `Rewrite` + `Get suggestions` pair, the selection toolbar, the step footers. Remove any mention of `Rewrite from source`, `Suggest changes`, `Start a new rewrite from the original draft`, `Ask for different suggestions`.
- `DESIGN.md` — §4: add `.studio-rail-tabs`, `.studio-rail-actions`, `.studio-changes-toolbar`, `.studio-selection-toolbar`; §5: replace the rail description (action bar at top, tabs). Note the one shadow use (selection toolbar) under the existing dropdown-shadow exception.
- `ARCHITECTURE.md` — only the "Studio state" paragraph if one exists (rename `panel`/`viewMode` → `railTab`/`docView`); the plan contract is untouched.
- `AGENTS.md` — add under UI rules: "A Studio action's label is stable; availability is `disabled` + a reason line" and "Selecting text never changes rail or document view by itself."

No new documentation files. This spec is a one-time plan under `docs/` like `editorial-logic-restoration-plan.md`; after implementation it stays as a record and is not a living owner.

---

## 14. Decisions taken in this spec that Mason may overrule

Each is implemented as written unless Mason says otherwise before the slice that contains it.

1. `Start a new rewrite from the original draft` is removed because `Rewrite` on the Suggestions tab is that action (every rewrite starts from the original). If Mason wants an explicit button in the Ask tab too, add a **text** button `Start over from the original draft` under the composer that calls `setRailTab('suggestions')` — nothing else.
2. Voice Blueprint has no primary button. Alternative: make `Rebuild from samples` primary.
3. The `Rewrite` document view is added (clean reading). Alternative: keep two views and add a "hide marks" toggle to Changes — rejected here because a toggle inside a view is a hidden mode.
4. Domain topics lose the `+N more` truncation inside the disclosure. Alternative: keep it with an explicit `Show all` — rejected because it is a third level.
5. Selection toolbar label varies by context (`Request a change to this passage` vs `Ask for a change to this passage` vs `Ask for a change about this passage`). Alternative: one label `Ask about this passage` everywhere.
6. The step footers use `Next: … →`. Alternative: `Continue to …` kept as wording but demoted to secondary and moved to the footer.

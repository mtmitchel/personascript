# Anti-pattern remediation — Round 2 fix plan

Status: approved for implementation. Follows `docs/anti-pattern-remediation-plan.md` (the Round‑2 plan). This document lists only the defects found by QA of the Round‑2 implementation and how to fix them. Everything else in the Round‑2 plan stands; do not revisit it.

Baseline for this round: uncommitted tree after Round 2. `npm run lint` clean, `npm test` 280/280, `npm run build` clean. Never commit, stash, reset, or create/modify worktrees. Do not touch port 3000.

## 1. Defects (verified in a browser on a private server)

| # | Severity | Defect | Where |
|---|---|---|---|
| F1 | High | `ConfirmDialog` accepts `destructive` and `children`; three callers pass `description=`, `isDestructive=`, and (Header) `confirmId=`. Those props are ignored, so six dialogs render title and buttons only: no body text, no destructive styling, and `#btn-confirm-reset-all` no longer exists. tsc did not catch it because `@types/react` is not installed and JSX props are unchecked. | `Header.tsx` L96–106; `DomainTopicsSection.tsx` L992–1005; `DomainProductsSection.tsx` L212–225 |
| F2 | High | `ConfirmDialog` renders inline. In Domain Knowledge the wrappers get `opacity-50` when `#toggle-domain-enable` is off (`DomainTopicsSection.tsx` L437, `DomainProductsSection.tsx` L98). `opacity < 1` creates a stacking context, so the `fixed z-50` overlay is trapped inside it: the dialog renders at 50% and the Products card intercepts clicks on the dialog buttons. | `ConfirmDialog.tsx` |
| F3 | Medium | Upload submit iterates only `readyItems`. A staged file that already failed extraction (for example a `.rtf` rejected by B2) is silently discarded when the ready files succeed and the modal closes. Also `setSubmitProgress('Added n samples.')` runs immediately before `onClose()`, so it is never seen. | `UploadModal.tsx` L217–260 |
| F4 | Medium | Keyboard focus on the sample file input is invisible. The input is `sr-only` (1×1 px) and carries the focus ring; the visible **Choose files** label shows nothing when the input is focused. | `UploadModal.tsx` L427–432 |
| F5 | Medium | A9 duplicate static ids were not removed: `btn-regenerate-topics`, `checkbox-use-draft-brief`, `btn-link-edit-draft-brief` (`DomainTopicsSection.tsx` L456/689, L469/701, L480/712, labels L475/707) and `btn-add-product` (`DomainProductsSection.tsx` L122/141). The branches are mutually exclusive, so the DOM is clean at runtime, but the source rule stands. | as listed |
| F6 | Medium | `README.md` L53 still says: “On the **Suggestions** tab the document always shows the current draft, and the view switcher is hidden. On **Ask for a change** and **Review** the document shows the open version with the view switcher.” This is the reversed Round‑1 behaviour and contradicts README L61 and `AGENTS.md` L51. | `README.md` L53 |
| F7 | Medium | `DESIGN.md` L99 claims `role="alertdialog"` for destructive actions and `aria-describedby`; the component uses `role="dialog"` and has no `aria-describedby`. L103 lists “Accept all” in the changes toolbar (removed in Round 2) and names the current-change class `border-l-neutral-900` (actual: `.studio-change.is-current`). | `DESIGN.md` L99, L103 |
| F8 | Medium | `role="radiogroup"` on `.studio-view-switcher` whose children are `<button aria-pressed>`. A radiogroup requires `role="radio"` children with `aria-checked`; this is invalid ARIA and was not in the plan. | `StudioView.tsx` L369 |
| F9 | Low | Unrequested changes in `DomainTopicsSection.tsx`: new-topic id prefix changed from `topic-` to `custom-topic-` (L196) and the bullet-stripping `.replace(/^[•\-\*]\s*/, '')` on pasted rules was removed (L191). | `DomainTopicsSection.tsx` L191, L196 |
| F10 | Low | `tests/a11yRemediation.test.ts` is a source-grep gate (4 tests) that was not in plan §4. It adds a permanent obligation nobody asked for. | `tests/a11yRemediation.test.ts` |

Not defects, recorded for the owner: after removing the last discipline, the Domain summary card shows the retained legacy `field` beside “0 core field disciplines” (`DomainView.tsx` L107 keeps `field` on purpose). The upload modal container has no `role="dialog"`/`aria-labelledby` (outside A8 scope). Both are deferred; do not change them in this round.

## 2. Fixes

### 2.1 `src/components/ConfirmDialog.tsx` (F2)

Render through a portal so no ancestor stacking context can trap the overlay. Keep the inline render for server rendering, which the tests use (`renderToStaticMarkup` does not support portals).

```tsx
import { createPortal } from 'react-dom';
// …
if (!open) return null;
const dialog = (
  <div className="fixed inset-0 z-50 …">…unchanged…</div>
);
return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
```

No other change to the component. Its API stays `open, title, confirmLabel, cancelLabel, destructive?, onConfirm, onCancel, children`.

### 2.2 Callers (F1)

**`Header.tsx` L96–106.** Replace the `description`, `isDestructive`, `confirmId` props:

```tsx
<ConfirmDialog
  open={showResetConfirm}
  title="Reset presets?"
  confirmLabel="Reset presets"
  cancelLabel="Keep everything"
  destructive
  onConfirm={() => { resetPresets(); setShowResetConfirm(false); }}
  onCancel={() => setShowResetConfirm(false)}
>
  <p>This restores default samples, voice, tone, and model choices. Your drafts, brief, and version history are kept.</p>
</ConfirmDialog>
```

`confirmId` is dropped; nothing references `#btn-confirm-reset-all` (grep `src tests` to confirm before removing). Do not add an `id` prop to `ConfirmDialog`.

**`DomainTopicsSection.tsx` L992–1005 and `DomainProductsSection.tsx` L212–225.** Keep the `confirmDialog` state shape as is (`description`, `isDestructive` are fine as state field names). Change only the JSX:

```tsx
<ConfirmDialog
  open={confirmDialog.open}
  title={confirmDialog.title}
  confirmLabel={confirmDialog.confirmLabel}
  cancelLabel={confirmDialog.cancelLabel}
  destructive={confirmDialog.isDestructive}
  onConfirm={…unchanged…}
  onCancel={…unchanged…}
>
  <p>{confirmDialog.description}</p>
</ConfirmDialog>
```

The existing state descriptions already carry the counts the Round‑2 plan asked for (“Your {n} topics, including any you wrote or edited, are replaced by new ones. You can undo once.” etc.). Do not reword them.

### 2.3 `src/components/UploadModal.tsx` (F3, F4)

**F3.** Before `setIsSubmitting(true)` in the upload branch, refuse to submit while any staged file is in error, so nothing is dropped silently:

```ts
const erroredItems = stagedFiles.filter((item) => item.status === 'error');
if (erroredItems.length > 0) {
  setGeneralError(
    erroredItems.length === 1
      ? `Remove “${erroredItems[0].fileName}” before adding the others.`
      : `Remove the ${erroredItems.length} files that can’t be added before adding the others.`,
  );
  return;
}
```

The per-file error line already says why each file was refused; **Remove file** already exists per row. Then delete the unseen `setSubmitProgress(\`Added …\`)` line at L255; the modal closing and the new rows appearing in the list are the success signal (there is no other success notice on Writing Samples, and none should be added).

Keep the existing `failed.length > 0` branch for files that fail inside `addSample`.

**F4.** Give the label a visible ring when its input has keyboard focus. The input (L408–423) and the label (L427) are not siblings: the label sits inside the `<div className="flex flex-col items-center">` at L425. Move the `<input className="sr-only" …>` so it is the first child of that div (immediately before the `<UploadCloud>` icon); nothing else about it changes. Then in `src/index.css`, inside `@layer base` next to the global focus rule:

```css
.sr-only:focus-visible ~ label[for] { outline: 2px solid var(--color-neutral-900); outline-offset: 3px; }
```

Verify by tabbing to the input: the **Choose files** button must show the 2 px ring.

### 2.4 Duplicate ids (F5)

Keep ids on the populated (header) branch; rename the empty-state branch:

- `DomainTopicsSection.tsx` empty state (L689–712): `btn-regenerate-topics` → `btn-regenerate-topics-empty`; `checkbox-use-draft-brief` → `checkbox-use-draft-brief-empty` (and its `<label htmlFor>` at L707); `btn-link-edit-draft-brief` → `btn-link-edit-draft-brief-empty`.
- `DomainProductsSection.tsx` empty state (L141): `btn-add-product` → `btn-add-product-empty`.

Tests: `tests/slice4Steps.test.ts` L63 and L66 test the empty state and match `/id="btn-regenerate-topics"/` and `/id="checkbox-use-draft-brief"/`; the regex still matches the `-empty` variant, so they pass unchanged, but tighten them so they prove the rename: change L63/L66/L68 to match `id="btn-regenerate-topics-empty"` and `id="checkbox-use-draft-brief-empty"`, and L134 to count `id="btn-add-product-empty"`. L105 and L151 (populated state) stay exact-match on the unsuffixed ids. Add one assertion in each of the two tests that the unsuffixed id does **not** appear in the empty-state HTML.

Check `README.md`, `ARCHITECTURE.md`, `DESIGN.md` for these id names before renaming (grep); update any mention.

### 2.5 `src/components/StudioView.tsx` L369 (F8)

Remove `role="radiogroup"`. Keep `aria-label="Document view"` by turning the wrapper into a `<div role="group" aria-label="Document view">`. The buttons keep `aria-pressed`.

### 2.6 `src/components/DomainTopicsSection.tsx` (F9)

Restore the two lines from the Round‑2 baseline:

- L191: `.map((c) => c.trim().replace(/^[•\-\*]\s*/, ''))`
- L196: `` id: `topic-${Date.now()}` ``

### 2.7 Docs (F6, F7)

**`README.md` L53.** Delete the two sentences “On the **Suggestions** tab the document always shows the current draft, and the view switcher is hidden. On **Ask for a change** and **Review** the document shows the open version with the view switcher.” Replace with one sentence: “Rail tabs never change the document view; only the view switcher does.”

**`DESIGN.md` L99.** Replace the sentence beginning “Implemented with” so it describes the component as built:
“Implemented with `role="dialog"`, `aria-modal="true"`, a heading referenced by `aria-labelledby`, body text passed as children, autofocus on the cancel/safe button, Escape and backdrop to cancel, focus restoration to the triggering element on close, and rendering through a portal on `document.body` so no ancestor opacity or transform can trap the overlay. Destructive confirmations use a rose confirm button.”

**`DESIGN.md` L103.** “Previous/Next, Accept all, and Undo” → “and Previous/Next”. “(`border-l-neutral-900`)” → “(`.studio-change.is-current`)”.

### 2.8 Tests (F10)

- Delete `tests/a11yRemediation.test.ts`. The CSS it asserts is verified by the browser checks in §4 and by review; a permanent grep gate was not requested.
- `tests/confirmDialog.test.ts`: keep as is; it must still pass after 2.1 (server render path).
- `tests/slice4Steps.test.ts`: only the edits in 2.4.
- Expected count after this round: 276 (280 − 4). Report the exact number. Never weaken an assertion.

## 3. Order of work

1. 2.1 ConfirmDialog portal → run `tests/confirmDialog.test.ts`.
2. 2.2 three callers.
3. 2.3 UploadModal.
4. 2.4 duplicate ids + slice4Steps test edits.
5. 2.5, 2.6.
6. 2.7 docs, 2.8 tests.
7. `npm run lint && npm test && npm run build`.

## 4. Browser acceptance checks

Run on a private server (`PORT=3100 DISABLE_HMR=true`), never on 3000. Mock `window.fetch` for `/api/**` before any action that could call a model. Report each check as pass/fail with what you observed in the live DOM; static markup does not count.

| # | Screen | Action | Expected |
|---|---|---|---|
| R1 | Header | Click **Reset presets** | Dialog shows title, the sentence about what is restored and kept, rose **Reset presets** button; Escape closes and returns focus to the trigger. Do not confirm. |
| R2 | Domain Knowledge, topics present, toggle **off** | Click **Regenerate topics** | Dialog renders at full opacity above everything (`document.body` child), body names the topic count, both buttons clickable; **Keep topics** closes. |
| R3 | Domain Knowledge | Delete topic, Clear topic, Clear all topics, Remove product | Each dialog has body text and a rose confirm button. |
| R4 | Writing Samples → Add samples | Tab to the file input | Visible 2 px ring around **Choose files**. |
| R5 | Same | Stage one `.rtf` and one `.txt`, click **Add sample** | Modal stays open; error “Remove “x.rtf” before adding the others.”; nothing added. Remove the `.rtf`, submit again → `.txt` added, modal closes. |
| R6 | Studio | Inspect `.studio-view-switcher` | `role="group"`, no `radiogroup`. |
| R7 | Domain Knowledge, empty and populated states | Inspect ids | No duplicate ids in source; DOM ids as renamed. |

## 5. Out of scope

Everything in Round‑2 plan §7, plus: do not change `ConfirmDialog`’s API, do not add `aria-describedby`/`alertdialog`, do not add success toasts, do not touch `DomainView.tsx` L107 or the upload modal container semantics, do not reformat files.

## 6. Report format

Same as Round‑2 plan §8: files changed; lint/test/build output with the test count; R1–R7 pass/fail with how observed; anything skipped and why; any deviation from this document.

# Voice-transfer evaluation — 8 September 2026

The implementation and software checks are complete. Live writing quality does not yet satisfy reliable voice-and-fidelity acceptance. The direct approach remains in place, with no automatic extraction or repair stage.

## Scope and method

The original and revised applications were exercised with the repository's two demonstration essays and its 169-word documentation proposal. No private writing was sent. Live writing used `gemini-3.8-flash`, and separate reviews used `gemini-3.1-pro-preview`, both with automatic reasoning. Exact SDK requests, responses, executed-model metadata, errors, input JSON, and invocation/source records are retained beside this report. Mock records are explicitly named `mock-*` and did not contact a provider.

The bounded evaluation is qualitative and covers one corpus and one source document. It cannot establish generalization to other authors or reliable semantic preservation. Local token checks establish only whether specific strings appear; AI reviews can miss errors or misclassify stylistic differences.

## Live observations

| Candidate | Observed output | Fidelity and review limitations |
| --- | --- | --- |
| Original baseline 1 | Strong craft rhetoric; self-reported 95% similarity. | Invents an engineer leaving, three weeks of rework, and an hour every week. Reuses a distinctive sample closing. |
| Original baseline 2 | Strong craft rhetoric; self-reported 95% similarity. | Invents half a working day of guessing and 30 minutes on Friday, loses the quarterly goal, and imposes workshop imagery. |
| First implementation (`revised-result-1.json`) | Close to the source's corporate wording. | Separate review flags weak voice transfer but incorrectly reports factual preservation; a possible consequence becomes certain. |
| Corrected direct prompt 1 (`corrected-result-1.json`) | Cleaner, shorter memo; largely uniform sentence cadence. | “Can lead” becomes definite harm. Review flags some weakened qualifications but misses this causal-status change and overweights generated pacing/imagery guidance. |
| Corrected direct prompt 2 (`corrected-result-2.json`) | More direct memo, still limited resemblance to the essay corpus. | “We hope” becomes “We need”; tentative claims become directives. Review catches several of these changes. |
| Pacing-guide removal (`final-result-1.json`) | Still close to corporate source phrasing. | “Can lead” becomes “leads directly.” Review incorrectly calls fidelity strict. Actual request inspection found numeric quotas still entering through generated do-list entries. |
| Final implementation (`final-confirmation-rewrite.json`) | Largely a copyedit of the corporate memo. | “Can lead” becomes “leading directly.” This time the separate reviewer correctly reports the change as an error. Generated do/don’t lists and numeric pacing guidance are absent from the final request. |
| Final refinement (`final-refine-result.json`) | Some sentence-length variation, but still contains “collaborative bandwidth” and similar source language. | Restores the possible negative outcome; “easily” adds emphasis and “Information stalls” interprets the unspecified inefficiencies. Broad factual claims from its review remain advisory. |
| Final selection edit (`final-selection-result.json`) | Replaces one sentence with “That loss can undermine results for everyone involved.” | Restores the source’s uncertainty. Exact string comparison confirms all surrounding text is unchanged. The complete resulting document receives a fresh review. |

The baseline did not reproduce corporate-style collapse in these two runs. It instead demonstrated style at the cost of source fidelity. The new pipeline removes misleading percentage scoring and exposes concrete review findings, but the recorded direct rewrites do not yet meet reliable voice-and-fidelity acceptance. No automatic extraction or repair stage was added.

## Browser observations

- Tone adjustments start off; the Apply checkbox enables the retained sliders, and disabling it disables them again.
- Final draft, word differences, and side-by-side views render the returned text.
- Copy was verified against the native browser clipboard. The higher-level clipboard tool returned empty content; that was a tool-route limitation, not evidence of a product defect.
- Markdown download was verified through native browser download events: `rewritten-draft.md`, completed, 555 bytes. A higher-level download wait timed out despite that successful event.
- Selecting a passage and applying an inline edit changed that exact passage and retained the surrounding draft in the mock run.
- Generation failure shows an error and retains the prior output. Review failure retains new output and explicitly shows review unavailable.
- Changing headings and section-order controls before a refinement changed the actual outgoing writing and review prompts. Structure-off help text reflects the control.
- Disabling a sample shows the stale-blueprint notice; reenabling it removes the notice.
- A keyboard key-up event on selected prose opens the inline edit form. A delayed mock selection edit disables rewrite, refinement, and selection actions until completion, then enables them again. A complete keyboard-only selection gesture was not exercised.
- The changed review panel fits at desktop and 390-pixel widths. The new metadata row was corrected and visually checked at 390 pixels. The unchanged header still creates horizontal overflow (page width about 741 pixels); its existing navigation remains an adjacent responsive-layout limitation.
- The final test page was refreshed after restarting the mock server to avoid stale Vite module content. An earlier screenshot showing cramped metadata was the old served candidate, not the corrected file.

## Final software checks

- `npm test`: 11/11 passed, covering corpus forwarding, preservation migration, empty/oversized input, stale guidance, tone opt-in, local exact checks, shared action prompts, structure-off controls, review policy, and blocked/truncated/malformed provider output.
- `npm run lint`: passed, including `server.ts`, `vite.config.ts`, application code, and tests.
- `npm run build`: passed for the browser bundle and server bundle.
- `git diff --check`: passed.
- Network-free HTTP integration suite: 23/23 passed. This includes all three writing actions; empty, disabled, and oversized corpora; empty, blocked, truncated, or failed generation; failed, malformed, or truncated review; malformed and out-of-bounds selections; duplicate passages with and without exact offsets; invalid field types; and synthesis attempting to overwrite user-owned domain settings and directives.
- Actual SDK requests were checked for complete samples, original source, system instructions, selected models, and absence of the demonstrated numeric quotas. The final server and shared-prompt source hashes matched the files loaded for final live actions.
- Historical compatibility was inspected in source: old fields remain optional, history is retained, old estimates are labelled historical/unverified, and new edits clear old assessments. No historical-result restoration UI was exercised; the current Studio initializes without an active historical result.

The first expanded HTTP run exposed two selection-validation defects, both fixed and verified by the final suite. A test attempted before the restarted server was listening received `ECONNREFUSED`; rerunning after its startup message passed. Development servers also reported the already-occupied HMR port 24678 while their HTTP endpoints worked. These were environment/timing limitations, not evidence of additional product defects. The preexisting server on port 3000 was left untouched.

## Outcome and remaining decision

The implementation makes samples available consistently, makes preservation/tone controls effective, protects previous output on failures, and replaces inflated similarity percentages with a separate, fallible review. The live evidence does **not** demonstrate that direct rewriting reliably transfers this author's voice while preserving meaning. The final confirmation still contains an altered causal claim, correctly surfaced by its review.

The next architectural decision is whether to trial a separate semantic-preservation stage or a different explicitly selected writing model. Neither was added or substituted in this task. There were no commits, pushes, worktree changes, or deployments. Task-owned recording servers were used only for demo QA and are stopped after evaluation.

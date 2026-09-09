# Browser QA observations

These observations cover the first completed implementation on the task-owned, network-free mock server at `http://localhost:3103`. The fixture is explicitly labelled as mocked QA. Later corrections still require a focused recheck.

- The initial rewrite and a quick refinement both returned prose and a separately rendered review. Captured SDK requests show both complete demo samples in both stages, proper system instructions, and the expected models and MIME types.
- At 1280 × 900, the Studio draft and review layout rendered without overlap.
- At 390 × 844, the new review panel fit. The unchanged header navigation caused page overflow: document width 741px against a 390px viewport, with the domain, Studio, model, and reset controls outside the viewport. This is an existing header issue, not a change in this task.
- Copy was verified through the browser's own `navigator.clipboard.readText()` after clicking Copy: the clipboard matched the displayed draft exactly. The browser tool's separate clipboard accessor returned an empty value, so its result was not used as evidence of a product failure.
- Markdown export was verified using native browser events after the higher-level download wait timed out. `Page.downloadWillBegin` named `rewritten-draft.md`; `Page.downloadProgress` reported `completed` with 555 received bytes. The events shared download GUID `16a06d3a-5728-43ab-9d70-fdc7f297d56f`.
- Vite emitted a development WebSocket connection warning because another pre-existing server owns the HMR port. The task did not stop that server. Browser rechecks use explicit reloads.

No screenshots were retained. Browser inspection used transient viewport captures.

# AGENTS.md

Project-level instructions for coding agents working in this repository.

## What this is

PersonaScript: a React/Vite + Express app that rewrites a draft in the author's
voice through a planned, approved, reviewed pipeline. Desktop and laptop only;
one expert user; no mobile work.

## Documentation owners

- [README.md](./README.md) — product behaviour, UI copy, limits, storage
  semantics, verification commands. Update it when behaviour or copy changes.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — structure, data flow, the editorial
  plan contract, invariants. Update it when a contract, route, storage key, or
  phase boundary changes.
- [DESIGN.md](./DESIGN.md) — the visual system. Update it when a component
  pattern or colour role changes.

Do not add a fourth document; extend the owner.

## Commands

- `npm run dev` — `tsx watch server.ts` (server restarts on save; client HMR)
- `npm test` — `node --import tsx --test tests/*.test.ts`
- `npm run lint` — `tsc --noEmit`
- `npm run build`

Run `npm run lint` and `npm test` after any change to `src/` or `server.ts`.
Tests prove validators and deterministic code paths only; a prompt change is
unverified until a plan or rewrite is regenerated and judged by the user.

## Rules that are easy to break

- A running `npm run dev` is the user's instance. Read the README section
  *Development while the app is in use* before editing watched files; never
  restart it without asking.
- Every `localStorage` shape must stay readable. Add optional fields or a
  normaliser; never shrink a limit or change a key without one.
- Quotations (plan `sourcePhrase`, conflicts, requests, audit evidence) are
  checked verbatim against their source. Do not loosen `sourceContainsPhrase`.
- Rules for fidelity and attribution live once, in `WRITING_SYSTEM_INSTRUCTION`
  and `DEFAULT_EDITORIAL_PREFERENCES`. Do not restate them in other prompts.
- Nothing generates on tab entry, and no rewrite runs without an approved plan.
- Studio UI copy is plain English for the author. Do not surface internal
  vocabulary (decision, passage, anchor, limit, treatment, coverage, digest,
  paragraph IDs) or offer more than one primary action per screen.
- A Studio action's label is stable; availability is `disabled` + a reason line.
- Selecting text never changes rail or document view by itself.
- Fonts load from Google Fonts, so a confined loopback browser renders with
  system fallbacks; rendered acceptance is the user's.
- Commit only when asked. Leave untracked paths you did not create alone.

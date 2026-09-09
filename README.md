<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/7b0a7816-b77d-43fb-8a29-5acaf71b6b0f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to your Gemini API key. The server loads `.env`; keep it untracked.
3. Run the app:
   `npm run dev`

> **Note on Server Changes:** If you edit API routes or backend code in `server.ts` or `src/domainGeneration.ts`, restart the development process (`npm run dev`) so Node reloads the updated API handlers.

## Workflow

PersonaScript uses a five-step workflow:
**Writing Samples → Voice Blueprint → Draft & Brief → Domain Knowledge → Rewrite Studio**

Navigation remains freely available across all tabs at any time without a forced wizard.

**Supported use:** PersonaScript is a desktop and laptop application. Phone use and mobile optimization are out of scope. Design and verify changes for desktop and laptop workflows; do not add mobile layouts or run mobile-specific checks unless explicitly requested.

## Writing pipeline and project brief

Each writing action sends the complete enabled sample corpus (up to 100,000 characters) to the selected writing model, then runs a separate review with the selected analysis model. Samples are used as voice evidence; the draft and optional project brief supply facts and qualifications. Review findings are advisory, and a review failure keeps the generated draft.

- **Draft & Brief view**: The dedicated **Draft & Brief** tab manages the raw **Original draft** and optional **Project brief**. Both inputs start empty in session state within `WritingAssistantContext`, preserving content across navigation. Domain generation accepts up to 100,000 characters each for the draft and brief without truncation; the brief input also enforces its 100,000-character limit (`PROJECT_BRIEF_MAX_CHARS`). Inputs survive tab navigation but are not restored after a page refresh.
- **Context roles & boundaries**: The draft is the editorial target and source account; the project brief supplies case context and professional rationale (not mandatory text or behavior directives); writing samples supply voice only. Prompts enclose the brief in untrusted data delimiters (`<project-brief>`) and instruct the models to ignore embedded commands.
- **Editorial scope**: The pipeline exercises editorial judgment: the writer may rephrase, combine, shorten, reorganize within selected structure controls, or omit unnecessary exposition, repetition, weak framing, and nonessential details without being forced to reproduce every source or brief sentence. The prompts require preservation of core contributions, consequences, and explicit locks. Supported facts from the brief can strengthen the draft; the advisory reviewer is instructed to flag factual conflicts, but can miss them.
- **Local preservation**: Local checks accept numbers and direct quotations supported by the project brief without false-positive unexpected warnings, while strictly verifying that explicit preservation locks on source numbers and quotations remain satisfied.
- **Document upload**: Supports uploading `.md`, `.txt`, `.docx`, and `.pdf` files into the brief or draft. Draft and brief extraction uses local-only parsing; scanned PDFs without extractable text show an error instead of invoking remote OCR. Upload failures preserve the previous input, and generation waits for pending source uploads.
- **Rewrite Studio**: Displays a concise source summary with an **Edit draft & brief** navigation link, transformation controls (intensity, preservation locks, tone sliders, domain quick toggles), and generation output with quick refine, selection editing, feedback, and review panels.

## Domain and product knowledge

The Domain view configures disciplinary concepts and product reference knowledge:

- **Concept recognition**: Disciplinary concepts (such as information hierarchy, user comprehension, informed choice, product value, and conversion) help the model recognize and articulate thinking already present in drafts without forcing jargon or fabricating unperformed work.
- **Product reference knowledge**: Product notes supply factual background for interpreting product names, feature relationships, and historical periods. Product discrepancies are flagged as observations in the advisory review rather than silently altering source facts.
- **Source-aware generation & checkbox**: Domain knowledge generation optionally incorporates the active draft and project brief alongside configured disciplines. The **Use draft and brief** checkbox (session UI state, initially enabled) sends draft and brief text to the generation endpoint. Disabling the checkbox omits both inputs from outbound requests and prompts. The choice survives tab navigation. Only clicking a generation control sends a request; editing sources does not regenerate cards automatically.
- **Supported vs. adjacent concepts**: Generation identifies both source-supported concepts (clearly demonstrated by decisions described in the draft/brief) and plausible adjacent concepts (cross-disciplinary ideas that could expose explanatory gaps). With source context, every generated concept has a `(supported)` or `(adjacent)` label and a concise explanation of its relevance. These are model assessments, not verified facts. Cards and their labels are saved with the voice profile and reflect the source used at generation time; review or regenerate them when changing projects. Without source context, cards retain generic concept examples without source labels.
- **Factual boundary**: Adjacent concepts are possibilities for interpretation/questions, NOT evidence the author performed extra work, research, or testing. They do not become factual authority for writer or reviewer models; the reviewer is instructed not to treat the absence of adjacent concepts as omissions.
- **Topic single-ownership**: Topic content has single ownership; disabling or deleting a topic removes its prompt contribution without term leakage. Empty topic lists are preserved.
- **API generation and broad coverage**: Disciplinary topics and concepts are populated dynamically via `/api/generate-domain-knowledge`. Each card has **Regenerate** to refresh only its description, concepts, and rules, and **Clear** to empty that content while retaining its name, category, and enabled state. **Regenerate all** and **Clear all** affect the full topics section; **Generate domain knowledge** populates an empty section.
- **Scope controls**: The page-level active switch controls all knowledge on the Domain page; individual topic and product toggles choose included entries.

## Verification commands

Run canonical commands:

- Run automated tests: `npm test`
- Check types and linting: `npm run lint`
- Build bundle: `npm run build`

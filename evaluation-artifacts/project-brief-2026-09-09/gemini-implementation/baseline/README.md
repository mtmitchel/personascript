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
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Writing pipeline checks

Each writing action sends the complete enabled sample corpus (up to 100,000 characters) to the selected writing model, then runs a separate review with the selected analysis model. Samples are used as voice evidence; draft facts and qualifications remain the source of truth. Review findings are advisory, and a review failure keeps the generated draft.

Run the focused deterministic checks with `npm test`. Run `npm run lint` for the TypeScript check and `npm run build` for the production bundle.

## Domain and product knowledge

The Domain view configures disciplinary concepts and product reference knowledge:

- **Concept recognition**: Disciplinary concepts (such as information hierarchy, user comprehension, informed choice, product value, and conversion) help the model recognize and articulate thinking already present in drafts without forcing jargon or fabricating unperformed work.
- **Product reference knowledge**: Product notes supply factual background for interpreting product names, feature relationships, and historical periods. Product discrepancies are flagged as observations in the advisory review rather than silently altering source facts.
- **Topic single-ownership**: Topic content has single ownership; disabling or deleting a topic removes its prompt contribution without term leakage. Empty topic lists are preserved.
- **API generation and broad coverage**: Disciplinary topics and concepts are populated dynamically via `/api/generate-domain-knowledge` from configured fields, core disciplines, and existing topic names, rather than static presets. Use **Generate domain knowledge** when empty, **Regenerate** to replace only the topics section, or **Clear** to empty topics while preserving product notes, audience context, and custom domain guidance.
- **Scope controls**: The page-level active switch controls all knowledge on the Domain page; individual topic and product toggles choose included entries.

The original draft starts empty. Use **Load sample** for the example, or **Clear** to empty only the draft input. Existing custom domain settings, audience context, and product references are retained across sessions.

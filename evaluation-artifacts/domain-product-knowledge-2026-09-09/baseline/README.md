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

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Form Maker (Vercel-ready)

This contains everything you need to run your app locally.

Open your deployed app at: https://your-app.vercel.app

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `VITE_GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. Run the app:
   `npm run dev`


## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Set the `VITE_GEMINI_API_KEY` environment variable in Vercel project settings.
4. Deploy (build command: `npm run build`, output directory: `dist`).

A `vercel.json` rewrite is included so routes like `/f/<formId>` work directly when opened in the browser.

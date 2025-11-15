# YouTube Explainer Evaluator (Gemini 2.0 Flash)

This project is a minimal full-stack app (Node.js + Express + vanilla HTML/CSS/JS) that evaluates YouTube explainer videos using Google Gemini 2.0 Flash.

It provides:
- A main input form capturing video URL and contextual fields
- Metric buttons to evaluate single metrics via the backend → Gemini
- An "Evaluate ALL" button to request all metrics at once and return structured JSON
- A small local JSON store for video titles

Files created
- `public/index.html`, `public/style.css`, `public/script.js` — frontend static app
- `server/server.js` — Express backend with API endpoints
- `server/videoDetails.json` — local store for video title lookups
- `.env.example` — environment variable example
- `package.json` — scripts and dependencies

Environment
1. Copy `.env.example` to `.env` and set your Gemini API key:

   GEMINI_API_KEY=your_real_key_here

2. Ensure Node >= 18 for fetch builtin. Install deps:

   npm install

3. (Optional but recommended) Install the official Google Generative AI Node SDK to enable the SDK-based path (the project will fall back to REST if the SDK is not present):

   # Install SDK for the root server
   npm install @google/generative-ai

   # Also install SDK inside the Amplify function folder before deployment
   cd amplify/functions/evaluator
   npm install @google/generative-ai
   cd -

   When deployed, ensure your function's package includes the SDK dependency (Amplify Console or CLI will install dependencies from `package.json`).

Local run

1. Start the server in development mode (auto-restarts):

   npm run dev

2. Open `http://localhost:3000` in your browser.

Gemini integration

This project targets the Gemini model family and the README and serverless function are configured to request the Gemini 2.0 Flash model:

```
https://generativeai.googleapis.com/v1/models/gemini-2.0-flash:generateText
```

The backend expects a bearer API key available in the environment variable `GEMINI_API_KEY`. In Amplify, set this on the Function configuration page (Functions -> your function -> Environment variables). For production-grade integration consider using the official Google Cloud GenAI SDK instead of raw REST calls — I can update the code to use the SDK if you prefer.

Deployment on AWS Amplify (Serverless Functions)

This repository contains a pre-bundled Amplify-compatible function at `amplify/functions/evaluator/` which implements the same endpoints as the previous Express server. The function uses the Gemini 2.0 Flash model.

High-level deploy steps

1. Host frontend:
   - Deploy the `public/` folder to Amplify Hosting (Static web hosting). Configure your branch and build settings normally.

2. Add the backend function:
   - Using Amplify CLI: `amplify add function` → choose "Lambda function" → Node.js. Replace the generated handler with the contents of `amplify/functions/evaluator/` or upload the folder as the function source.
   - Using Amplify Console: create a Function and paste the handler code.

3. Configure API routes:
   - Create an API (REST) in Amplify and attach routes that point to the evaluator function.
   - Example routes:
     - GET  /video-title
     - POST /video-title
     - POST /evaluate-metric
     - POST /evaluate-all

4. Set environment variables:
   - In Amplify Console (Functions -> your function) add `GEMINI_API_KEY` with your Gemini API key.

Persistence note (IMPORTANT)

The function reads a bundled `videoDetails.json` and, when the `POST /video-title` endpoint is used, writes to `/tmp/videoDetails.json`. Writes to `/tmp` in Lambda are ephemeral and may be lost between invocations (cold starts). For reliable persistence you should store titles in S3 or DynamoDB. If you want, I can modify the function to use S3 or DynamoDB and add IAM role instructions.

Serverless behavior & local testing

- Locally you can continue to run the Express server (`npm run dev`) for quick iteration.
- The Amplify function is the recommended production backend — deploy it and wire the frontend to the function's API endpoints.

Next improvements (optional)

- Use the official Google Cloud GenAI SDK for Node.js (recommended).
- Integrate S3 or DynamoDB for persistent video title storage and set proper IAM roles.
- Add automated tests for prompt generation and response parsing.


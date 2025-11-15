/*
  Express server for YouTube explainer evaluation with Gemini 2.0 Flash
  - Loads/stores local video title mapping in videoDetails.json
  - Exposes endpoints:
    POST /api/evaluate-metric  -> evaluate single metric
    POST /api/evaluate-all     -> evaluate all metrics
    GET  /api/video-title?url=  -> fetch stored title for URL
    POST /api/video-title      -> save title for URL

  Environment:
    GEMINI_API_KEY in .env

  Note: The Gemini HTTP endpoint used here is a configuration that may need
  to be adapted to your specific Google GenAI / Gemini account details.
*/

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Use native fetch in Node 18+. If your node version is older, install node-fetch.
import { fileURLToPath } from 'url';
import { callGemini } from './geminiClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const VIDEO_DB = path.join(__dirname, 'videoDetails.json');

// List of metrics (same labels used on frontend)
export const METRICS = [
  'Clarity of problem articulation',
  'Purpose statement strength',
  'Logical flow of explanation',
  'Audience understanding level',
  'Concept simplification quality',
  'Technical accuracy of explanations',
  'Confidence in voice delivery',
  'Degree of passion conveyed',
  'Pacing and speed of narration',
  'Structural clarity of content',
  'Visual organization without styling',
  'Completeness of topic coverage',
  'Engagement level of the explanation',
  'Reasoning transparency',
  'Justification of technical decisions',
  'Clarity of transitions between topics',
  'Interview-readiness of communication',
  'Problem-solving mindset demonstration',
  'Career-oriented presentation quality'
];

async function readVideoDB() {
  try {
    const raw = await fs.readFile(VIDEO_DB, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeVideoDB(db) {
  await fs.writeFile(VIDEO_DB, JSON.stringify(db, null, 2), 'utf-8');
}

function constructPrompt(details, metricList) {
  // details: { url, videoType, purpose, keyConcepts, justifications, goal, title }
  // metricList: array of metric strings to evaluate

  const header = `You are an expert reviewer for YouTube educational videos. Evaluate the following video and provide for each requested metric a numeric score from 1 (poor) to 10 (excellent) and a concise actionable feedback section with suggestions.`;

  const videoInfo = `Video URL: ${details.url}\nTitle: ${details.title || 'Unknown Title'}\nVideo Type: ${details.videoType}\nPurpose: ${details.purpose}\nKey Concepts: ${details.keyConcepts}\nJustifications: ${details.justifications}\nEvaluation Goal: ${details.goal}`;

  const metricsText = metricList.map((m, i) => `${i + 1}. ${m}`).join('\n');

  // Ask Gemini to return JSON for easier parsing
  const instruction = `Return a JSON object. For each metric include: { "metric": "<name>", "score": <1-10>, "feedback": "<actionable feedback>" } and at the end add a field "common_improvements" with an array of top 5 cross-metric suggestions. Output only valid JSON.`;

  const prompt = [header, videoInfo, 'Metrics to evaluate:', metricsText, instruction].join('\n\n');
  return prompt;
}

// callGemini is imported from server/geminiClient.js which attempts to use the
// official Google GenAI SDK if installed, and falls back to the REST endpoint.

// Helper: parse response that is JSON or JSON-like
function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    // Attempt to extract JSON substring
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const substr = text.slice(start, end + 1);
      try { return JSON.parse(substr); } catch (e) { /* ignore */ }
    }
    return null;
  }
}

app.get('/api/video-title', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  try {
    const db = await readVideoDB();
    const title = db[url] || null;
    res.json({ url, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read video DB' });
  }
});

app.post('/api/video-title', async (req, res) => {
  const { url, title } = req.body;
  if (!url || !title) return res.status(400).json({ error: 'url and title required' });
  try {
    const db = await readVideoDB();
    db[url] = title;
    await writeVideoDB(db);
    res.json({ ok: true, url, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to write video DB' });
  }
});

app.post('/api/evaluate-metric', async (req, res) => {
  try {
    const { url, videoType, purpose, keyConcepts, justifications, goal, metric } = req.body;
    if (!url || !metric) return res.status(400).json({ error: 'Missing url or metric' });

    const db = await readVideoDB();
    const title = db[url] || 'Unknown Title';

    const details = { url, videoType, purpose, keyConcepts, justifications, goal, title };

    const prompt = constructPrompt(details, [metric]);
    const raw = await callGemini(prompt);

    // Attempt to parse JSON; fallback to text
    const parsed = tryParseJSON(raw);
    if (parsed) {
      // If parsed is object or array, try to return structured result for the single metric
      return res.json({ ok: true, raw, parsed });
    }

    // If we couldn't parse, return the raw text as feedback
    res.json({ ok: true, raw });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Evaluation failed' });
  }
});

app.post('/api/evaluate-all', async (req, res) => {
  try {
    const { url, videoType, purpose, keyConcepts, justifications, goal } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const db = await readVideoDB();
    const title = db[url] || 'Unknown Title';

    const details = { url, videoType, purpose, keyConcepts, justifications, goal, title };

    const prompt = constructPrompt(details, METRICS);
    const raw = await callGemini(prompt);
    const parsed = tryParseJSON(raw);
    if (parsed) {
      return res.json({ ok: true, raw, parsed });
    }
    // If not JSON, return textual output
    res.json({ ok: true, raw });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Evaluation failed' });
  }
});

// Fallback for client-side routing if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

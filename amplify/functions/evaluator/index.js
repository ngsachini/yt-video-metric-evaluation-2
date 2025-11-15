/*
  Amplify / AWS Lambda compatible handler for the YouTube Explainer Evaluator.

  This single Lambda function implements simple routing for:
    GET  /video-title?url=...
    POST /video-title       { url, title }
    POST /evaluate-metric   { url, videoType, purpose, keyConcepts, justifications, goal, metric }
    POST /evaluate-all      { url, videoType, purpose, keyConcepts, justifications, goal }

  Notes:
  - Uses the Gemini 2.0 Flash model via the public Generative AI REST endpoint.
  - Requires GEMINI_API_KEY set in the Lambda environment variables (Amplify Console -> Function -> Environment variables).
  - For video title storage: reads bundled `videoDetails.json` and an ephemeral file at /tmp/videoDetails.json if present.
    Writing to /tmp is ephemeral across Lambda invocations; for persistent storage use S3 or DynamoDB (recommended).

  Author: generated-by-copilot
*/

import fs from 'fs/promises';
import path from 'path';
import { callGemini } from './geminiClient.js';

const VIDEO_DB_BUNDLED = path.join(path.dirname(new URL(import.meta.url).pathname), 'videoDetails.json');
const VIDEO_DB_TMP = '/tmp/videoDetails.json';

const METRICS = [
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
  // Prefer ephemeral tmp write if exists (written during runtime), fallback to bundled file
  try {
    const tmp = await fs.readFile(VIDEO_DB_TMP, 'utf-8');
    return JSON.parse(tmp);
  } catch (e) {
    // ignore
  }
  try {
    const raw = await fs.readFile(VIDEO_DB_BUNDLED, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

async function writeVideoDB(db) {
  // Note: writing to /tmp is ephemeral in Lambda. For persistence, integrate S3 or DynamoDB.
  await fs.writeFile(VIDEO_DB_TMP, JSON.stringify(db, null, 2), 'utf-8');
}

function constructPrompt(details, metricList) {
  const header = `You are an expert reviewer for YouTube educational videos. Evaluate the following video and provide for each requested metric a numeric score from 1 (poor) to 10 (excellent) and a concise actionable feedback section with suggestions.`;
  const videoInfo = `Video URL: ${details.url}\nTitle: ${details.title || 'Unknown Title'}\nVideo Type: ${details.videoType}\nPurpose: ${details.purpose}\nKey Concepts: ${details.keyConcepts}\nJustifications: ${details.justifications}\nEvaluation Goal: ${details.goal}`;
  const metricsText = metricList.map((m, i) => `${i + 1}. ${m}`).join('\n');
  const instruction = `Return a JSON object. For each metric include: { "metric": "<name>", "score": <1-10>, "feedback": "<actionable feedback>" } and at the end add a field "common_improvements" with an array of top 5 cross-metric suggestions. Output only valid JSON.`;
  return [header, videoInfo, 'Metrics to evaluate:', metricsText, instruction].join('\n\n');
}

// callGemini is provided by amplify/functions/evaluator/geminiClient.js. It will
// try to use the official Google GenAI SDK if available, otherwise fallback to REST.

function tryParseJSON(text) {
  try { return JSON.parse(text); } catch (err) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const substr = text.slice(start, end + 1);
      try { return JSON.parse(substr); } catch (e) { /* fallthrough */ }
    }
    return null;
  }
}

function buildResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event) {
  const path = event.path || '/';
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';

  try {
    if (path.startsWith('/video-title') && method === 'GET') {
      const url = event.queryStringParameters?.url;
      if (!url) return buildResponse(400, { error: 'Missing url param' });
      const db = await readVideoDB();
      return buildResponse(200, { url, title: db[url] || null });
    }

    if (path.startsWith('/video-title') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { url, title } = body;
      if (!url || !title) return buildResponse(400, { error: 'url and title required' });
      const db = await readVideoDB();
      db[url] = title;
      await writeVideoDB(db);
      return buildResponse(200, { ok: true, url, title });
    }

    if (path.startsWith('/evaluate-metric') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { url, videoType, purpose, keyConcepts, justifications, goal, metric } = body;
      if (!url || !metric) return buildResponse(400, { error: 'Missing url or metric' });
      const db = await readVideoDB();
      const title = db[url] || 'Unknown Title';
      const details = { url, videoType, purpose, keyConcepts, justifications, goal, title };
      const prompt = constructPrompt(details, [metric]);
      const raw = await callGemini(prompt);
      const parsed = tryParseJSON(raw);
      return buildResponse(200, { ok: true, raw, parsed });
    }

    if (path.startsWith('/evaluate-all') && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { url, videoType, purpose, keyConcepts, justifications, goal } = body;
      if (!url) return buildResponse(400, { error: 'Missing url' });
      const db = await readVideoDB();
      const title = db[url] || 'Unknown Title';
      const details = { url, videoType, purpose, keyConcepts, justifications, goal, title };
      const prompt = constructPrompt(details, METRICS);
      const raw = await callGemini(prompt);
      const parsed = tryParseJSON(raw);
      return buildResponse(200, { ok: true, raw, parsed });
    }

    return buildResponse(404, { error: 'Not found' });
  } catch (err) {
    console.error('Handler error', err);
    return buildResponse(500, { error: err.message || 'Internal error' });
  }
}

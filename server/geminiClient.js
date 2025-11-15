/*
  Gemini client adapter for server.
  - Tries to use the official Google GenAI Node SDK if installed.
  - Falls back to REST call if SDK is not available.

  To use the SDK, install one of the official packages (example):
    npm install @google-ai/generative

  This adapter keeps the rest of the app unchanged and returns the textual
  output from Gemini / GenAI APIs.
*/

export async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in environment');

  // Try SDKs by common package names. If present, use the SDK.
  const sdkCandidates = ['@google-ai/generative', '@google/generative-ai', '@google/generative'];
  for (const name of sdkCandidates) {
    try {
      const mod = await import(name);
      // Attempt common client names
      if (mod.TextServiceClient || mod.TextsClient || mod.Generative) {
        // Best-effort SDK usage. The shape may vary by SDK version — we attempt a generic call.
        try {
          // TextServiceClient path (example)
          if (mod.TextServiceClient) {
            const client = new mod.TextServiceClient();
            const res = await client.generateText({ model: 'models/gemini-2.0-flash', prompt: { text: prompt }, temperature: 0.2, maxOutputTokens: 800 });
            return JSON.stringify(res);
          }

          // Generic entry
          if (mod.Generative && typeof mod.Generative === 'function') {
            const client = new mod.Generative();
            if (client.generateText) {
              const out = await client.generateText({ model: 'gemini-2.0-flash', prompt, temperature: 0.2 });
              return JSON.stringify(out);
            }
          }

          if (mod.TextsClient) {
            const client = new mod.TextsClient();
            const out = await client.generate({ model: 'models/gemini-2.0-flash', input: prompt });
            return JSON.stringify(out);
          }
        } catch (e) {
          // If SDK call fails, continue to fallback
          console.warn('SDK present but call failed, falling back to REST:', e.message || e);
        }
      }
    } catch (e) {
      // module not found — try next
    }
  }

  // Fallback to REST API call (previous behavior). This works if you provide a bearer API key.
  const ENDPOINT = 'https://generativeai.googleapis.com/v1/models/gemini-2.0-flash:generateText';
  const body = { prompt: prompt, maxOutputTokens: 800, temperature: 0.2 };
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  if (data.output && typeof data.output === 'string') return data.output;
  if (data.output && Array.isArray(data.output) && data.output[0]?.content) return data.output[0].content;
  if (data.choices && data.choices[0]?.message?.content) return data.choices[0].message.content;
  return JSON.stringify(data);
}

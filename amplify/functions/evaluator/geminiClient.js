/*
  Gemini client adapter for the Amplify Lambda function.
  - Tries to use the official Google GenAI Node SDK if installed in the function package.
  - Falls back to the REST call if SDK is not available.

  Note: For best results install the official SDK in the function (e.g. `npm install @google-ai/generative`) and set
  appropriate credentials or environment variables in the Amplify function configuration.
*/

export async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in environment variables');

  const sdkCandidates = ['@google-ai/generative', '@google/generative-ai', '@google/generative'];
  for (const name of sdkCandidates) {
    try {
      const mod = await import(name);
      if (mod.TextServiceClient || mod.TextsClient || mod.Generative) {
        try {
          if (mod.TextServiceClient) {
            const client = new mod.TextServiceClient();
            const res = await client.generateText({ model: 'models/gemini-2.0-flash', prompt: { text: prompt }, temperature: 0.2, maxOutputTokens: 800 });
            return JSON.stringify(res);
          }
          if (mod.TextsClient) {
            const client = new mod.TextsClient();
            const out = await client.generate({ model: 'models/gemini-2.0-flash', input: prompt });
            return JSON.stringify(out);
          }
          if (mod.Generative) {
            const client = new mod.Generative();
            if (client.generateText) {
              const out = await client.generateText({ model: 'gemini-2.0-flash', prompt, temperature: 0.2 });
              return JSON.stringify(out);
            }
          }
        } catch (e) {
          console.warn('SDK present but call failed, falling back to REST:', e.message || e);
        }
      }
    } catch (e) {
      // not found, try next
    }
  }

  // REST fallback
  const ENDPOINT = 'https://generativeai.googleapis.com/v1/models/gemini-2.0-flash:generateText';
  const body = { prompt, maxOutputTokens: 800, temperature: 0.2 };
  const resp = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  if (data.output && typeof data.output === 'string') return data.output;
  if (data.output && Array.isArray(data.output) && data.output[0]?.content) return data.output[0].content;
  if (data.choices && data.choices[0]?.message?.content) return data.choices[0].message.content;
  return JSON.stringify(data);
}

/* Frontend logic for YouTube Explainer Evaluator
   - Handles main form
   - Creates metric buttons and hooks events
   - Calls backend endpoints via fetch
*/

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

const $ = (id) => document.getElementById(id);

function createMetricButtons() {
  const container = $('metricsButtons');
  container.innerHTML = '';
  METRICS.forEach((m, idx) => {
    const btn = document.createElement('button');
    btn.className = 'metric-btn';
    btn.textContent = `${idx + 1}. ${m}`;
    btn.addEventListener('click', () => evaluateMetric(m, btn));
    container.appendChild(btn);
  });
}

function readForm() {
  return {
    url: $('url').value.trim(),
    videoType: $('videoType').value,
    purpose: $('purpose').value.trim(),
    keyConcepts: $('keyConcepts').value.trim(),
    justifications: $('justifications').value.trim(),
    goal: $('goal').value.trim()
  };
}

function setLoading(state, text = 'Loading...') {
  const results = $('resultsContent');
  if (state) {
    results.innerHTML = `<em>${text}</em>`;
  }
}

async function evaluateMetric(metric, btn) {
  const data = readForm();
  if (!data.url) return alert('Please enter a YouTube URL');
  setLoading(true, `Evaluating: ${metric}`);
  btn.disabled = true;
  try {
    const resp = await fetch('/api/evaluate-metric', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ...data, metric })
    });
    const json = await resp.json();
    renderMetricResult(metric, json);
  } catch (err) {
    $('resultsContent').textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

function renderMetricResult(metric, payload) {
  const el = $('resultsContent');
  if (!payload) { el.textContent = 'No response'; return; }

  if (payload.parsed) {
    // parsed may be array/object. Find the metric entry
    let found = null;
    const p = payload.parsed;
    if (Array.isArray(p)) found = p.find(x => x.metric && x.metric.includes(metric));
    else if (p.metric && p.metric.includes(metric)) found = p;
    else if (p.results) {
      found = p.results.find(r => r.metric && r.metric.includes(metric));
    } else if (Array.isArray(p.metrics)) {
      found = p.metrics.find(r => r.metric && r.metric.includes(metric));
    }

    if (found) {
      el.innerHTML = `<h3>${metric}</h3>Score: <strong>${found.score}</strong>\n\nFeedback:\n${found.feedback}`;
      return;
    }
  }

  // Fallback: show raw
  el.textContent = payload.raw || JSON.stringify(payload, null, 2);
}

async function evaluateAll() {
  const data = readForm();
  if (!data.url) return alert('Please enter a YouTube URL');
  setLoading(true, 'Evaluating all metrics (this may take a while)...');
  $('evaluateAllBtn').disabled = true;
  try {
    const resp = await fetch('/api/evaluate-all', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const json = await resp.json();
    renderAllResults(json);
  } catch (err) {
    $('resultsContent').textContent = 'Error: ' + err.message;
  } finally {
    $('evaluateAllBtn').disabled = false;
  }
}

function renderAllResults(payload) {
  const el = $('resultsContent');
  if (!payload) { el.textContent = 'No response'; return; }
  if (payload.parsed) {
    const parsed = payload.parsed;
    // If parsed is an object with array of metrics
    let metricsArr = [];
    if (Array.isArray(parsed)) metricsArr = parsed;
    else if (parsed.metrics) metricsArr = parsed.metrics;
    else if (parsed.results) metricsArr = parsed.results;
    else {
      // try to find metric-like props
      metricsArr = Object.values(parsed).filter(v => v && v.metric && v.score);
    }

    let html = '';
    if (metricsArr.length) {
      html += '<div class="all-scores">';
      metricsArr.forEach(m => {
        html += `<h3>${m.metric}</h3><strong>Score: ${m.score}</strong><div>${m.feedback}</div><hr>`;
      });
      html += '</div>';
    }

    if (parsed.common_improvements) {
      html += '<h3>Common Improvement Suggestions</h3><ul>' + parsed.common_improvements.map(s => `<li>${s}</li>`).join('') + '</ul>';
    }

    if (!html) html = payload.raw || JSON.stringify(parsed, null, 2);
    el.innerHTML = html;
    return;
  }
  el.textContent = payload.raw || JSON.stringify(payload, null, 2);
}

async function fetchStoredTitle() {
  const url = $('url').value.trim();
  if (!url) return alert('Enter URL first');
  setLoading(true, 'Fetching stored title...');
  try {
    const resp = await fetch(`/api/video-title?url=${encodeURIComponent(url)}`);
    const json = await resp.json();
    if (json.title) {
      $('titleInput').value = json.title;
      $('resultsContent').textContent = `Found title: ${json.title}`;
    } else {
      $('resultsContent').textContent = 'No stored title for this URL.';
    }
  } catch (err) { $('resultsContent').textContent = 'Error: ' + err.message; }
}

async function saveTitle() {
  const url = $('url').value.trim();
  const title = $('titleInput').value.trim();
  if (!url || !title) return alert('URL and title required');
  setLoading(true, 'Saving title...');
  try {
    const resp = await fetch('/api/video-title', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url, title }) });
    const json = await resp.json();
    if (json.ok) $('resultsContent').textContent = `Saved title for ${url}`;
    else $('resultsContent').textContent = 'Save failed: ' + JSON.stringify(json);
  } catch (err) { $('resultsContent').textContent = 'Error: ' + err.message; }
}

function init() {
  createMetricButtons();
  $('evaluateAllBtn').addEventListener('click', evaluateAll);
  $('fetchTitleBtn').addEventListener('click', fetchStoredTitle);
  $('saveTitleBtn').addEventListener('click', saveTitle);
}

document.addEventListener('DOMContentLoaded', init);

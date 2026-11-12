/**
 * MR.SALL AI — Gemini API Diagnostic Script
 * Run: node diag.mjs YOUR_GEMINI_API_KEY
 *
 * Tests:
 *  1. ListModels — what models are actually available to this key
 *  2. generateContent on the current configured model (gemini-3.8-flash)
 *  3. generateContent on gemini-2.0-flash (known stable)
 *  4. generateContent on gemini-1.5-flash (older stable)
 */

const apiKey = process.argv[2];
if (!apiKey || apiKey.startsWith('YOUR_')) {
  console.error('Usage: node diag.mjs YOUR_GEMINI_API_KEY');
  process.exit(1);
}

// Mask key in all output
const mask = k => k ? `${k.slice(0,6)}...${k.slice(-4)}` : 'MISSING';

async function timedFetch(label, url, init = {}) {
  const start = Date.now();
  let res, elapsed;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
    elapsed = Date.now() - start;
  } catch (e) {
    elapsed = Date.now() - start;
    console.error(`  ❌ ${label} — EXCEPTION after ${elapsed}ms: ${e.name}: ${e.message}`);
    return null;
  }
  console.log(`  ${res.ok ? '✅' : '❌'} ${label} — HTTP ${res.status} in ${elapsed}ms`);
  return { res, elapsed };
}

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log(' MR.SALL AI — Gemini API Diagnostic');
  console.log(`  API Key: ${mask(apiKey)}`);
  console.log('══════════════════════════════════════════════\n');

  // ── 1. List available models ──────────────────────────────────
  console.log('1. Listing available Gemini models for this API key...');
  const listResult = await timedFetch(
    'GET /v1beta/models',
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`
  );
  if (listResult?.res?.ok) {
    const data = await listResult.res.json();
    const models = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    console.log(`  Found ${models.length} models supporting generateContent:`);
    models.forEach(m => console.log(`    • ${m}`));
    console.log();
  } else if (listResult?.res) {
    const body = await listResult.res.text();
    console.log(`  Response body: ${body.slice(0, 300)}\n`);
  }

  // ── 2. Test current model (gemini-3.8-flash) ──────────────────
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    generationConfig: { maxOutputTokens: 50 }
  });
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };

  async function testModel(modelId) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    console.log(`Testing: ${modelId}`);
    const r = await timedFetch(`POST ${modelId}:generateContent`, url, { method: 'POST', headers, body: payload });
    if (!r) return;
    const rawText = await r.res.text();
    if (r.res.ok) {
      try {
        const json = JSON.parse(rawText);
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '(no text)';
        console.log(`  Response: "${text.slice(0,120)}"`);
      } catch {
        console.log(`  Raw: ${rawText.slice(0, 200)}`);
      }
    } else {
      // Sanitize — remove actual key from body before printing
      const safe = rawText.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED]');
      console.log(`  Error body: ${safe.slice(0, 400)}`);
    }
    console.log(`  Elapsed: ${r.elapsed}ms\n`);
    return { ok: r.res.ok, status: r.res.status, elapsed: r.elapsed };
  }

  console.log('\n2. Testing current configured model (gemini-3.8-flash)...');
  await testModel('gemini-3.8-flash');

  console.log('3. Testing gemini-2.0-flash (current stable)...');
  await testModel('gemini-2.0-flash');

  console.log('4. Testing gemini-1.5-flash (previous stable)...');
  await testModel('gemini-1.5-flash');

  console.log('5. Testing gemini-2.5-flash-preview-05-20...');
  await testModel('gemini-2.5-flash-preview-05-20');

  console.log('\n══════════════════════════════════════════════');
  console.log(' Diagnostic complete. API key NOT printed above.');
  console.log('══════════════════════════════════════════════\n');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

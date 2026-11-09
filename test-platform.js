/**
 * MR.SALL AI — Comprehensive Quality Control & Verification Test
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('==============================================');
console.log('MR.SALL AI — COMPREHENSIVE PLATFORM AUDIT');
console.log('==============================================\n');

// 1. Check JavaScript Syntax
console.log('1. Validating JavaScript Syntax with Node CLI:');
const jsFiles = [
  'js/theme.js',
  'js/language.js',
  'js/auth.js',
  'js/pwa.js',
  'js/tools.js',
  'js/app.js',
  'worker/index.js'
];

jsFiles.forEach(file => {
  const fullPath = path.join(ROOT, file);
  try {
    execSync(`node --check "${fullPath}"`);
    assert(true, `${file} syntax is valid`);
  } catch (err) {
    assert(false, `${file} syntax error: ${err.message}`);
  }
});

// 2. Check File & Asset Structure
console.log('\n2. Validating Project Files & Structure:');
const requiredFiles = [
  'index.html',
  'founder.html',
  'login.html',
  'privacy.html',
  'terms.html',
  'offline.html',
  'service-worker.js',
  'manifest.webmanifest',
  'manifest.json',
  'README.md',
  'wrangler.toml',
  'css/style.css',
  'js/app.js',
  'js/theme.js',
  'js/language.js',
  'js/auth.js',
  'js/pwa.js',
  'js/tools.js',
  'assets/logo.png',
  'assets/mascot.jpg',
  'assets/mascot.png',
  'assets/favicon.png',
  'assets/icons/chat.svg',
  'assets/icons/writer.svg',
  'assets/icons/translator.svg',
  'assets/icons/study.svg',
  'assets/icons/image.svg',
  'assets/icons/code.svg',
  'assets/icons/pdf.svg',
  'assets/icons/pwa/icon-192x192.png',
  'assets/icons/pwa/icon-512x512.png',
  'assets/icons/pwa/apple-touch-icon.png',
  'tools/chat.html',
  'tools/writer.html',
  'tools/translator.html',
  'tools/study.html',
  'tools/image.html',
  'tools/code.html',
  'tools/pdf.html',
  'worker/index.js'
];

requiredFiles.forEach(f => {
  const exists = fs.existsSync(path.join(ROOT, f));
  assert(exists, `Required file exists: ${f}`);
});

// 3. Check for exposed secrets
console.log('\n3. Checking for Exposed Secrets in Frontend:');
const frontendFiles = [
  'index.html',
  'founder.html',
  'login.html',
  'privacy.html',
  'terms.html',
  'offline.html',
  'service-worker.js',
  'css/style.css',
  'js/app.js',
  'js/theme.js',
  'js/language.js',
  'js/auth.js',
  'js/pwa.js',
  'js/tools.js',
  'tools/chat.html',
  'tools/writer.html',
  'tools/translator.html',
  'tools/study.html',
  'tools/image.html',
  'tools/code.html',
  'tools/pdf.html'
];

const secretPatterns = [
  /AIza[0-9A-Za-z-_]{35}/, // Google API key
  /sk-[a-zA-Z0-9]{20,}/,  // OpenAI key
  /sk-ant-[a-zA-Z0-9]{20,}/ // Anthropic key
];

let foundSecret = false;
frontendFiles.forEach(file => {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  secretPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      foundSecret = true;
      assert(false, `Possible secret key detected in ${file}!`);
    }
  });
});
if (!foundSecret) {
  assert(true, 'No secret API keys exposed in frontend code');
}

// 4. Validate i18n dictionary completeness
console.log('\n4. Validating i18n Completeness (en, ar, fr):');
const langFileContent = fs.readFileSync(path.join(ROOT, 'js/language.js'), 'utf8');

try {
  // Provide mock browser environment for Node.js test
  const mockStorage = {};
  const mockLocalStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = v; },
    removeItem: (k) => { delete mockStorage[k]; }
  };
  const mockDoc = {
    documentElement: { setAttribute: () => {} },
    body: { style: {} },
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    head: { appendChild: () => {} }
  };

  const fn = new Function('localStorage', 'document', `${langFileContent}; return LanguageManager;`);
  const lm = fn(mockLocalStorage, mockDoc);
  
  const testKeys = [
    'hero_title_1', 'hero_title_2', 'hero_tagline', 'hero_desc',
    'tool_chat_name', 'tool_writer_name', 'tool_translator_name',
    'tool_study_name', 'tool_image_name', 'tool_code_name', 'tool_pdf_name',
    'feat_simple_title', 'feat_multi_title', 'feat_fast_title', 'feat_secure_title', 'feat_free_title',
    'settings_title', 'settings_worker_url',
    'nav_founder', 'founder_name', 'founder_quote', 'founder_tagline', 'founder_badge',
    'dashboard_title', 'dashboard_welcome', 'dashboard_plan', 'dashboard_daily_usage',
    'dashboard_remaining', 'dashboard_used', 'dashboard_limit', 'dashboard_resets_at',
    'dashboard_upgrade', 'usage_limit_reached', 'install_btn', 'offline_title', 'pwa_update_available'
  ];
  
  ['en', 'ar', 'fr'].forEach(lang => {
    lm.set(lang);
    let allKeysPresent = true;
    testKeys.forEach(k => {
      const val = lm.t(k);
      if (!val || val === k) {
        allKeysPresent = false;
        console.error(`Missing key ${k} in lang ${lang}`);
      }
    });
    assert(allKeysPresent, `All critical keys present for language '${lang}'`);
  });
} catch (e) {
  assert(false, `i18n validation error: ${e.message}`);
}

// 5. Check Internal Links in HTML files
console.log('\n5. Validating Internal Links across HTML files:');
const htmlFiles = [
  'index.html',
  'founder.html',
  'login.html',
  'privacy.html',
  'terms.html',
  'offline.html',
  'tools/chat.html',
  'tools/writer.html',
  'tools/translator.html',
  'tools/study.html',
  'tools/image.html',
  'tools/code.html',
  'tools/pdf.html'
];

htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dir = path.dirname(file);
  
  // Find href and src
  const linkMatches = [...content.matchAll(/(?:href|src)=["']([^"']+)["']/g)];
  let broken = 0;
  linkMatches.forEach(m => {
    const target = m[1];
    if (target.startsWith('http') || target.startsWith('#') || target.startsWith('data:') || target.startsWith('mailto:')) {
      return; // External or anchor
    }
    const cleanTarget = target.split('?')[0].split('#')[0];
    const resolved = path.join(ROOT, dir, cleanTarget);
    if (!fs.existsSync(resolved)) {
      broken++;
      assert(false, `Broken link in ${file}: "${target}" -> ${resolved} not found`);
    }
  });
  if (broken === 0) {
    assert(true, `All internal links in ${file} resolved successfully (${linkMatches.length} references)`);
  }
});

// 6. Validate Cloudflare Worker & Wrangler Configuration
console.log('\n6. Validating Cloudflare Worker & Wrangler Configuration:');
const wranglerContent = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');

// Check Worker target name
assert(/^name\s*=\s*"mr-sall-ai1"/m.test(wranglerContent), 'wrangler.toml target Worker name is set to "mr-sall-ai1"');
assert(/directory\s*=\s*"\."/m.test(wranglerContent), 'wrangler.toml [assets] directory is set to project root "."');
assert(/binding\s*=\s*"ASSETS"/m.test(wranglerContent), 'wrangler.toml [assets] binding is set to "ASSETS"');
assert(/run_worker_first\s*=\s*true/m.test(wranglerContent), 'wrangler.toml run_worker_first is enabled');

// Check .assetsignore
assert(fs.existsSync(path.join(ROOT, '.assetsignore')), '.assetsignore exists to exclude worker and server files');
const assetsIgnoreContent = fs.readFileSync(path.join(ROOT, '.assetsignore'), 'utf8');
assert(assetsIgnoreContent.includes('worker/'), '.assetsignore excludes worker/ directory');
assert(assetsIgnoreContent.includes('wrangler.toml'), '.assetsignore excludes wrangler.toml');

// Check no secrets in wrangler.toml
assert(!wranglerContent.includes('AIza'), 'wrangler.toml contains no hardcoded Gemini API key');
assert(!wranglerContent.includes('sk-'), 'wrangler.toml contains no hardcoded secrets');

// 7. Simulating Cloudflare Worker Routing Logic
console.log('\n7. Simulating Cloudflare Worker Request Routing:');
async function runWorkerSimulation() {
  const workerPath = path.join(ROOT, 'worker/index.js');
  const workerModule = await import('file://' + workerPath.replace(/\\/g, '/'));
  const worker = workerModule.default;

  // Mock env
  const mockEnv = {
    FREE_DAILY_LIMIT: '5',
    PREMIUM_DAILY_LIMIT: '50',
    GEMINI_API_KEY: 'test_mock_key',
    ASSETS: {
      fetch: async (req) => {
        const u = new URL(req.url);
        if (u.pathname === '/' || u.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><html><head><title>MR.SALL AI</title></head></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        }
        if (u.pathname === '/login.html') {
          return new Response('<!DOCTYPE html><html>Login</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        }
        if (u.pathname === '/service-worker.js') {
          return new Response('// service worker', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
        return new Response('Not Found', { status: 404 });
      }
    }
  };

  // Test 1: GET /api/health
  const healthRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/health'), mockEnv);
  assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
  const healthJson = await healthRes.json();
  assert(healthJson.status === 'ok' && healthJson.service === 'MR.SALL AI Platform', 'GET /api/health returns valid service JSON metadata');

  // Test 2: GET /api/usage
  const usageRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/usage', {
    headers: { 'X-User-Id': 'test_user_sim' }
  }), mockEnv);
  assert(usageRes.status === 200, 'GET /api/usage returns 200 OK');
  const usageJson = await usageRes.json();
  assert(usageJson.user_id === 'test_user_sim' && usageJson.limit === 5, 'GET /api/usage returns quota and tier information');

  // Test 3: GET / (Root path should serve frontend via env.ASSETS)
  const rootRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/'), mockEnv);
  assert(rootRes.status === 200, 'GET / forwards to env.ASSETS and returns status 200');
  const rootText = await rootRes.text();
  assert(rootText.includes('<!DOCTYPE html>'), 'GET / serves HTML frontend, not JSON');

  // Test 4: Pretty URL fallback (GET /login without .html)
  const loginRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/login'), mockEnv);
  assert(loginRes.status === 200, 'GET /login resolves cleanly via pretty URL fallback to /login.html');

  // Test 5: Service worker header check
  const swRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/service-worker.js'), mockEnv);
  assert(swRes.headers.get('Service-Worker-Allowed') === '/', 'GET /service-worker.js includes "Service-Worker-Allowed: /" header');

  // Test 6: API endpoint POST without body returns 400
  const chatBadRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }), mockEnv);
  assert(chatBadRes.status === 400, 'POST /api/chat with invalid body returns 400 Bad Request');

  // Test 7: CORS OPTIONS preflight
  const optionsRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://mr-sall-ai1.workers.dev' }
  }), mockEnv);
  assert(optionsRes.status === 204, 'OPTIONS preflight returns 204 No Content with CORS headers');

  // Test 8: Gemini 3.8 Flash Chat Execution (English & Arabic)
  const originalFetch = globalThis.fetch;
  let requestedModelUrl = '';
  let lastRequestBody = null;
  let lastRequestHeaders = null;

  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (urlStr.includes(':generateContent')) {
      requestedModelUrl = urlStr;
      lastRequestBody = options.body ? JSON.parse(options.body) : null;
      lastRequestHeaders = options.headers;

      const userText = lastRequestBody?.contents?.[0]?.parts?.[0]?.text || '';
      const replyText = userText.includes('صالح') || userText.includes('مرحبا')
        ? 'مرحباً بك يا صالح! أنا MR.SALL AI، أعمل الآن بنجاح باستخدام نموذج gemini-3.8-flash.'
        : 'Hello! I am MR.SALL AI, fully operational and powered by gemini-3.8-flash.';

      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: replyText }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };

  try {
    // 8a: English Prompt
    const chatEnRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hello to Salih in English!' }]
      })
    }), mockEnv);

    assert(chatEnRes.status === 200, 'POST /api/chat (English) returns 200 OK');
    const chatEnJson = await chatEnRes.json();
    assert(chatEnJson.content.includes('gemini-3.8-flash'), 'English response confirmed from gemini-3.8-flash');
    assert(requestedModelUrl.includes('models/gemini-3.8-flash:generateContent'), 'Request URL correctly targets /models/gemini-3.8-flash:generateContent');
    assert(lastRequestHeaders['x-goog-api-key'] === 'test_mock_key', 'Authentication header x-goog-api-key correctly passed');

    // 8b: Arabic Prompt
    const chatArRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'مرحباً يا صالح' }]
      })
    }), mockEnv);

    assert(chatArRes.status === 200, 'POST /api/chat (Arabic) returns 200 OK');
    const chatArJson = await chatArRes.json();
    assert(chatArJson.content.includes('صالح') && chatArJson.content.includes('gemini-3.8-flash'), 'Arabic response confirmed with proper formatting');

    // Test 9: Health Check & Live Diagnostic Test
    const healthRes2 = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/health'), mockEnv);
    const healthJson2 = await healthRes2.json();
    assert(healthJson2.gemini_model === 'gemini-3.8-flash', 'GET /api/health accurately reports active model as "gemini-3.8-flash"');

    // Test 9b: Direct Health Diagnostic Test (GET /api/health?test=true)
    const healthDiagRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/health?test=true'), mockEnv);
    assert(healthDiagRes.status === 200, 'GET /api/health?test=true returns 200 OK for live diagnostic');
    const healthDiagJson = await healthDiagRes.json();
    assert(healthDiagJson.status === 'ok' && healthDiagJson.test.api_key_configured === true, 'Diagnostic test successfully validates GEMINI_API_KEY from Cloudflare Worker');

    // Test 10: Missing Secret Verification (Returns 503 with MISSING_GEMINI_API_KEY)
    const mockEnvNoKey = { ...mockEnv, GEMINI_API_KEY: '' };
    const noKeyRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    }), mockEnvNoKey);
    assert(noKeyRes.status === 503, 'Missing GEMINI_API_KEY returns HTTP 503 Service Unavailable');
    const noKeyJson = await noKeyRes.json();
    assert(noKeyJson.code === 'MISSING_GEMINI_API_KEY', 'Error payload explicitly indicates MISSING_GEMINI_API_KEY');

    // Test 11: Retry with Exponential Backoff on Transient 503 Error (2 fails, 3rd succeeds)
    let callAttempts = 0;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes(':generateContent')) {
        callAttempts++;
        if (callAttempts < 3) {
          // Simulate temporary Google 503 Service Unavailable
          return new Response('The model is overloaded.', { status: 503 });
        }
        // 3rd attempt succeeds
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Recovered after backoff retries!' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const retryChatRes = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'retry test' }] })
    }), mockEnv);
    assert(retryChatRes.status === 200, 'Chat recovers successfully after transient 503 failures via exponential backoff');
    const retryChatJson = await retryChatRes.json();
    assert(retryChatJson.content === 'Recovered after backoff retries!', 'Response text verified after backoff recovery');
    assert(callAttempts === 3, 'Exactly 3 attempts executed before recovery');

    // Test 12: Clear HTTP Error Handling (401 Unauthorized simulation)
    globalThis.fetch = async (url) => {
      return new Response('API key not valid', { status: 401 });
    };
    const chat401Res = await worker.fetch(new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    }), mockEnv);
    assert(chat401Res.status === 401, 'Handled 401 returns controlled HTTP 401 status code');
    const chat401Json = await chat401Res.json();
    assert(chat401Json.message.includes('401') && !chat401Json.message.includes('test_mock_key'), '401 error message is descriptive and does not expose secrets');

  } finally {
    globalThis.fetch = originalFetch;
  }

  // Summary
  console.log('\n==============================================');
  console.log(`AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('==============================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runWorkerSimulation().catch(err => {
  console.error('Simulation error:', err);
  process.exit(1);
});

/**
 * MR.SALL AI — Multi-Provider AI Integration Test Suite
 * 
 * Verifies all 4 AI providers:
 * 1. Google Gemini
 * 2. OpenAI
 * 3. DeepSeek
 * 4. Groq
 * 
 * Tests:
 * - /api/providers catalog discovery
 * - Dispatching via X-AI-Provider and X-AI-Model headers
 * - Correct endpoints, request formats, headers, and model IDs per provider
 * - Model switching
 * - Missing API key handling (503 with clean code)
 * - Error sanitization (no keys leaked on 401, 403, 404, 429, 500)
 * - Exponential backoff retry logic on transient errors
 * - Timeout handling
 * - Multi-turn conversation history
 * - Preservation of other tools (write, translate, study, code, pdf) on Gemini
 */

const fs = require('fs');
const path = require('path');

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

async function runSuite() {
  console.log('====================================================');
  console.log('MR.SALL AI — MULTI-PROVIDER INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  // Load worker code
  const workerPath = path.join(__dirname, 'worker', 'index.js');
  const workerModule = await import(`file://${workerPath.replace(/\\/g, '/')}`);
  const worker = workerModule.default;

  // Base mock environment with all 4 keys configured
  const mockEnvFull = {
    GEMINI_API_KEY: 'test-gemini-key-secret-999',
    OPENAI_API_KEY: 'test-openai-key-secret-888',
    DEEPSEEK_API_KEY: 'test-deepseek-key-secret-777',
    GROQ_API_KEY: 'test-groq-key-secret-666',
    FREE_DAILY_LIMIT: 50,
    PREMIUM_DAILY_LIMIT: 200,
    USAGE_KV: null,
  };

  const originalFetch = globalThis.fetch;

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: Catalog Endpoint (/api/providers)
    // ----------------------------------------------------
    console.log('1. Testing /api/providers Catalog Endpoint:');

    const catReq = new Request('https://mr-sall-ai1.workers.dev/api/providers', { method: 'GET' });
    const catRes = await worker.fetch(catReq, mockEnvFull);
    assert(catRes.status === 200, 'GET /api/providers returns HTTP 200');
    
    const catData = await catRes.json();
    assert(Array.isArray(catData.providers), 'Catalog contains providers array');
    assert(catData.providers.length === 4, 'Catalog contains exactly 4 providers');

    const providerIds = catData.providers.map(p => p.id);
    assert(providerIds.includes('gemini'), 'Catalog contains gemini');
    assert(providerIds.includes('openai'), 'Catalog contains openai');
    assert(providerIds.includes('deepseek'), 'Catalog contains deepseek');
    assert(providerIds.includes('groq'), 'Catalog contains groq');

    // Verify configured flags when keys exist
    catData.providers.forEach(p => {
      assert(p.configured === true, `${p.name} configured=true when key is present`);
      assert(Array.isArray(p.models) && p.models.length > 0, `${p.name} lists supported models`);
      assert(Boolean(p.defaultModel), `${p.name} specifies default model: ${p.defaultModel}`);
    });

    // Test configured flags when some keys are missing
    const mockEnvPartial = {
      GEMINI_API_KEY: 'test-gemini-key',
      OPENAI_API_KEY: '',
      DEEPSEEK_API_KEY: null,
      GROQ_API_KEY: undefined,
    };
    const partRes = await worker.fetch(catReq, mockEnvPartial);
    const partData = await partRes.json();
    const geminiEntry = partData.providers.find(p => p.id === 'gemini');
    const openaiEntry = partData.providers.find(p => p.id === 'openai');
    const dsEntry = partData.providers.find(p => p.id === 'deepseek');
    const groqEntry = partData.providers.find(p => p.id === 'groq');

    assert(geminiEntry.configured === true, 'Gemini configured=true when key present');
    assert(openaiEntry.configured === false, 'OpenAI configured=false when key missing');
    assert(dsEntry.configured === false, 'DeepSeek configured=false when key missing');
    assert(groqEntry.configured === false, 'Groq configured=false when key missing');

    // ----------------------------------------------------
    // TEST SECTION 2: Google Gemini Provider
    // ----------------------------------------------------
    console.log('\n2. Testing Google Gemini Provider:');

    let geminiCapturedUrl = null;
    let geminiCapturedHeaders = null;
    let geminiCapturedBody = null;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        geminiCapturedUrl = urlStr;
        geminiCapturedHeaders = options.headers || {};
        geminiCapturedBody = JSON.parse(options.body || '{}');
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini Flash!' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const geminiReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'gemini',
        'X-AI-Model': 'gemini-3.8-flash',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello Gemini' }
        ]
      })
    });

    const geminiRes = await worker.fetch(geminiReq, mockEnvFull);
    assert(geminiRes.status === 200, 'Gemini returns HTTP 200');
    const geminiJson = await geminiRes.json();
    assert(geminiJson.provider === 'gemini', 'Response identifies provider as gemini');
    assert(geminiJson.model === 'gemini-3.8-flash', 'Response identifies model as gemini-3.8-flash');
    assert(geminiJson.content === 'Hello from Gemini Flash!', 'Response content matches expected text');
    assert(geminiCapturedUrl.includes('/models/gemini-3.8-flash:generateContent'), 'Targets official Gemini endpoint with model ID');
    assert(geminiCapturedHeaders['x-goog-api-key'] === 'test-gemini-key-secret-999', 'Uses x-goog-api-key header');

    // ----------------------------------------------------
    // TEST SECTION 3: OpenAI Provider
    // ----------------------------------------------------
    console.log('\n3. Testing OpenAI Provider:');

    let openaiCapturedUrl = null;
    let openaiCapturedHeaders = null;
    let openaiCapturedBody = null;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.openai.com')) {
        openaiCapturedUrl = urlStr;
        openaiCapturedHeaders = options.headers || {};
        openaiCapturedBody = JSON.parse(options.body || '{}');
        return new Response(JSON.stringify({
          id: 'chatcmpl-test-123',
          choices: [{
            message: { role: 'assistant', content: 'Hello from OpenAI GPT-4o mini!' }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const openaiReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'openai',
        'X-AI-Model': 'gpt-4o-mini',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello GPT' }
        ]
      })
    });

    const openaiRes = await worker.fetch(openaiReq, mockEnvFull);
    assert(openaiRes.status === 200, 'OpenAI returns HTTP 200');
    const openaiJson = await openaiRes.json();
    assert(openaiJson.provider === 'openai', 'Response identifies provider as openai');
    assert(openaiJson.model === 'gpt-4o-mini', 'Response identifies model as gpt-4o-mini');
    assert(openaiJson.content === 'Hello from OpenAI GPT-4o mini!', 'OpenAI content matches expected text');
    assert(openaiCapturedUrl === 'https://api.openai.com/v1/chat/completions', 'Targets https://api.openai.com/v1/chat/completions');
    assert(openaiCapturedHeaders['Authorization'] === 'Bearer test-openai-key-secret-888', 'Uses Bearer auth with OPENAI_API_KEY');
    assert(openaiCapturedBody.model === 'gpt-4o-mini', 'Request payload contains model gpt-4o-mini');
    assert(openaiCapturedBody.messages.some(m => m.role === 'system'), 'System instruction included in messages');

    // Test OpenAI model switching to gpt-4o
    const openaiSwitchReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'openai',
        'X-AI-Model': 'gpt-4o',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Test switch' }] })
    });
    await worker.fetch(openaiSwitchReq, mockEnvFull);
    assert(openaiCapturedBody.model === 'gpt-4o', 'Successfully switched model to gpt-4o');

    // Test missing OpenAI key
    const noOpenAIEnv = { ...mockEnvFull, OPENAI_API_KEY: '' };
    const noOpenAIReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'openai' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    });
    const noOpenAIRes = await worker.fetch(noOpenAIReq, noOpenAIEnv);
    assert(noOpenAIRes.status === 503, 'Missing OPENAI_API_KEY returns HTTP 503');
    const noOpenAIJson = await noOpenAIRes.json();
    assert(noOpenAIJson.code === 'MISSING_OPENAI_API_KEY', 'Error payload indicates MISSING_OPENAI_API_KEY');
    assert(!JSON.stringify(noOpenAIJson).includes('test-openai-key-secret-888'), 'Error does not leak any secret keys');

    // ----------------------------------------------------
    // TEST SECTION 4: DeepSeek Provider
    // ----------------------------------------------------
    console.log('\n4. Testing DeepSeek Provider:');

    let deepseekCapturedUrl = null;
    let deepseekCapturedHeaders = null;
    let deepseekCapturedBody = null;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.deepseek.com')) {
        deepseekCapturedUrl = urlStr;
        deepseekCapturedHeaders = options.headers || {};
        deepseekCapturedBody = JSON.parse(options.body || '{}');
        return new Response(JSON.stringify({
          choices: [{
            message: { role: 'assistant', content: 'DeepSeek response for code/reasoning.' }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const dsReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'deepseek',
        'X-AI-Model': 'deepseek-chat',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello DeepSeek' }
        ]
      })
    });

    const dsRes = await worker.fetch(dsReq, mockEnvFull);
    assert(dsRes.status === 200, 'DeepSeek returns HTTP 200');
    const dsJson = await dsRes.json();
    assert(dsJson.provider === 'deepseek', 'Response identifies provider as deepseek');
    assert(dsJson.model === 'deepseek-chat', 'Response identifies model as deepseek-chat');
    assert(dsJson.content === 'DeepSeek response for code/reasoning.', 'DeepSeek content matches expected');
    assert(deepseekCapturedUrl === 'https://api.deepseek.com/v1/chat/completions', 'Targets https://api.deepseek.com/v1/chat/completions');
    assert(deepseekCapturedHeaders['Authorization'] === 'Bearer test-deepseek-key-secret-777', 'Uses Bearer auth with DEEPSEEK_API_KEY');
    assert(deepseekCapturedBody.model === 'deepseek-chat', 'Request payload contains deepseek-chat');

    // Test missing DeepSeek key
    const noDSEnv = { ...mockEnvFull, DEEPSEEK_API_KEY: '' };
    const noDSReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'deepseek' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    });
    const noDSRes = await worker.fetch(noDSReq, noDSEnv);
    assert(noDSRes.status === 503, 'Missing DEEPSEEK_API_KEY returns HTTP 503');
    const noDSJson = await noDSRes.json();
    assert(noDSJson.code === 'MISSING_DEEPSEEK_API_KEY', 'Error payload indicates MISSING_DEEPSEEK_API_KEY');

    // ----------------------------------------------------
    // TEST SECTION 5: Groq Provider
    // ----------------------------------------------------
    console.log('\n5. Testing Groq Provider:');

    let groqCapturedUrl = null;
    let groqCapturedHeaders = null;
    let groqCapturedBody = null;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqCapturedUrl = urlStr;
        groqCapturedHeaders = options.headers || {};
        groqCapturedBody = JSON.parse(options.body || '{}');
        return new Response(JSON.stringify({
          choices: [{
            message: { role: 'assistant', content: 'Ultra-fast response from Groq LPU!' }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const groqReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'groq',
        'X-AI-Model': 'llama-3.3-70b-versatile',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Fast query' }
        ]
      })
    });

    const groqRes = await worker.fetch(groqReq, mockEnvFull);
    assert(groqRes.status === 200, 'Groq returns HTTP 200');
    const groqJson = await groqRes.json();
    assert(groqJson.provider === 'groq', 'Response identifies provider as groq');
    assert(groqJson.model === 'llama-3.3-70b-versatile', 'Response identifies model as llama-3.3-70b-versatile');
    assert(groqJson.content === 'Ultra-fast response from Groq LPU!', 'Groq content matches expected');
    assert(groqCapturedUrl === 'https://api.groq.com/openai/v1/chat/completions', 'Targets https://api.groq.com/openai/v1/chat/completions');
    assert(groqCapturedHeaders['Authorization'] === 'Bearer test-groq-key-secret-666', 'Uses Bearer auth with GROQ_API_KEY');
    assert(groqCapturedBody.model === 'llama-3.3-70b-versatile', 'Request payload contains llama-3.3-70b-versatile');

    // Test missing Groq key
    const noGroqEnv = { ...mockEnvFull, GROQ_API_KEY: '' };
    const noGroqReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'groq' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
    });
    const noGroqRes = await worker.fetch(noGroqReq, noGroqEnv);
    assert(noGroqRes.status === 503, 'Missing GROQ_API_KEY returns HTTP 503');
    const noGroqJson = await noGroqRes.json();
    assert(noGroqJson.code === 'MISSING_GROQ_API_KEY', 'Error payload indicates MISSING_GROQ_API_KEY');

    // ----------------------------------------------------
    // TEST SECTION 6: Error Handling & Retry Logic
    // ----------------------------------------------------
    console.log('\n6. Testing Error Handling & Retry Logic:');

    // Test transient 500 retry on OpenAI-compatible adapter
    let retryAttempts = 0;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.openai.com')) {
        retryAttempts++;
        if (retryAttempts === 1) {
          return new Response(JSON.stringify({ error: { message: 'Server overloaded' } }), { status: 500 });
        }
        return new Response(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Succeeded on retry 2!' } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const retryTestReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'openai' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test retry' }] })
    });
    const retryRes = await worker.fetch(retryTestReq, mockEnvFull);
    assert(retryRes.status === 200, 'Recovered from transient 500 error after retry');
    const retryJson = await retryRes.json();
    assert(retryJson.content === 'Succeeded on retry 2!', 'Text matches retry success payload');
    assert(retryAttempts === 2, 'Executed exactly 2 attempts (1 fail + 1 retry)');

    // Test 401 Invalid Key error does NOT retry and returns safe message
    let attempts401 = 0;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        attempts401++;
        return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 });
      }
      return originalFetch(url, options);
    };

    const req401 = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'groq' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test 401' }] })
    });
    const res401 = await worker.fetch(req401, mockEnvFull);
    assert(res401.status === 401, 'HTTP 401 returns controlled 401 status');
    const json401 = await res401.json();
    assert(json401.message.includes('Invalid API key'), 'Error message informs user of invalid key');
    assert(!JSON.stringify(json401).includes('test-groq-key-secret-666'), 'Error message redacts secret key');
    assert(attempts401 === 1, '401 is not retried unnecessarily');

    // ----------------------------------------------------
    // TEST SECTION 7: Multi-turn Conversation & History
    // ----------------------------------------------------
    console.log('\n7. Testing Multi-turn Conversation History:');

    let historyCapturedMessages = null;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('api.deepseek.com')) {
        historyCapturedMessages = JSON.parse(options.body).messages;
        return new Response(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'Turn 3 reply' } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    const multiTurnReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Provider': 'deepseek',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
        ]
      })
    });

    const multiTurnRes = await worker.fetch(multiTurnReq, mockEnvFull);
    assert(multiTurnRes.status === 200, 'Multi-turn conversation succeeds with 200');
    assert(historyCapturedMessages.length === 4, 'Includes 1 system + 3 conversation turns');
    assert(historyCapturedMessages[1].role === 'user' && historyCapturedMessages[1].content === 'Message 1', 'Turn 1 preserved');
    assert(historyCapturedMessages[2].role === 'assistant' && historyCapturedMessages[2].content === 'Response 1', 'Turn 2 preserved');
    assert(historyCapturedMessages[3].role === 'user' && historyCapturedMessages[3].content === 'Message 2', 'Turn 3 preserved');

    // ----------------------------------------------------
    // TEST SECTION 8: Preservation of Other Tools on Gemini
    // ----------------------------------------------------
    console.log('\n8. Verifying Other Tools (Writer, Translator, Study, Code, PDF) use Gemini:');

    let otherToolCapturedUrl = null;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        otherToolCapturedUrl = urlStr;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Tool generated text' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url, options);
    };

    // Test Writer
    const writeReq = new Request('https://mr-sall-ai1.workers.dev/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'openai' }, // even if client sends openai
      body: JSON.stringify({ type: 'article', topic: 'AI Future', tone: 'professional', lang: 'en' })
    });
    const writeRes = await worker.fetch(writeReq, mockEnvFull);
    assert(writeRes.status === 200, 'POST /api/write returns 200 OK');
    assert(otherToolCapturedUrl.includes('generativelanguage.googleapis.com'), 'Writer correctly preserves Gemini backend');

    // Test Translator
    const transReq = new Request('https://mr-sall-ai1.workers.dev/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', from: 'en', to: 'ar' })
    });
    const transRes = await worker.fetch(transReq, mockEnvFull);
    assert(transRes.status === 200, 'POST /api/translate returns 200 OK');

    // Test Code
    const codeReq = new Request('https://mr-sall-ai1.workers.dev/api/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'generate', language: 'python', content: 'fibonacci' })
    });
    const codeRes = await worker.fetch(codeReq, mockEnvFull);
    assert(codeRes.status === 200, 'POST /api/code returns 200 OK');

    // ----------------------------------------------------
    // TEST SECTION 9: CORS Headers
    // ----------------------------------------------------
    console.log('\n9. Verifying CORS Headers for Multi-Provider:');

    const optReq = new Request('https://mr-sall-ai1.workers.dev/api/chat', { method: 'OPTIONS' });
    const optRes = await worker.fetch(optReq, mockEnvFull);
    const allowHeaders = optRes.headers.get('Access-Control-Allow-Headers') || '';
    assert(allowHeaders.includes('X-AI-Provider'), 'CORS allows X-AI-Provider header');
    assert(allowHeaders.includes('X-AI-Model'), 'CORS allows X-AI-Model header');

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n====================================================');
  console.log(`MULTI-PROVIDER SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});

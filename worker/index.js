/**
 * MR.SALL AI — Cloudflare Worker Backend
 * Version 2.0.0
 * 
 * Features:
 * - Google Gemini Dynamic Model Discovery & Integration for Chat, Writer, Translator, Study, Code, and PDF tools
 * - Stability AI integration for Image generation
 * - Backend-enforced configurable daily usage limits (Free vs Premium)
 * - Cloudflare KV namespace support (USAGE_KV) with resilient in-memory fallback
 * - Short-term burst rate limiting (30 req/min per IP)
 * - Safe CORS with rate-limit headers exposed
 * - Real-time /api/usage status check endpoint
 */

// ── In-Memory Stores (Fallback when Cloudflare KV is not bound) ──
const burstRateStore = new Map();
const memoryDailyUsageStore = new Map();

/**
 * Short-term burst rate limiting (per-IP window)
 */
function checkBurstRateLimit(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const entry = burstRateStore.get(ip);
  if (!entry || (now - entry.start > windowMs)) {
    burstRateStore.set(ip, { count: 1, start: now });
    return true;
  }
  entry.count++;
  if (entry.count > limit) return false;
  return true;
}

/**
 * Calculate seconds until next UTC midnight for daily resets
 */
function getSecondsUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * Get current UTC date key (e.g. "2026-11-09")
 */
function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Clean up older in-memory daily entries to prevent unbounded growth
 */
function pruneOldMemoryUsage(todayKey) {
  if (memoryDailyUsageStore.size > 5000) {
    for (const key of memoryDailyUsageStore.keys()) {
      if (!key.endsWith(todayKey)) {
        memoryDailyUsageStore.delete(key);
      }
    }
  }
}

/**
 * Daily Usage Tracker:
 * Checks and increments per-user daily counts.
 * Uses Cloudflare KV if bound (USAGE_KV), falls back to in-memory map.
 */
async function getDailyUsage(env, userId, dateKey) {
  const key = `usage:${userId}:${dateKey}`;
  if (env.USAGE_KV) {
    try {
      const val = await env.USAGE_KV.get(key);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch (e) {
      console.warn('KV read error, falling back to memory:', e);
    }
  }
  return memoryDailyUsageStore.get(key) || 0;
}

async function recordDailyUsage(env, userId, dateKey, newCount) {
  const key = `usage:${userId}:${dateKey}`;
  pruneOldMemoryUsage(dateKey);
  memoryDailyUsageStore.set(key, newCount);

  if (env.USAGE_KV) {
    try {
      // Keep for 2 days (172800 seconds)
      await env.USAGE_KV.put(key, newCount.toString(), { expirationTtl: 172800 });
    } catch (e) {
      console.warn('KV write error, cached in memory:', e);
    }
  }
}

/**
 * Determine daily limits based on user tier & environment configuration
 */
function resolveUserLimits(env, request) {
  const freeLimit = parseInt(env.FREE_DAILY_LIMIT || '50', 10);
  const premiumLimit = parseInt(env.PREMIUM_DAILY_LIMIT || '500', 10);

  // Read tier from header, default to 'free'
  const rawTier = (request.headers.get('X-User-Tier') || 'free').toLowerCase();
  const tier = (rawTier === 'premium' || rawTier === 'pro') ? 'premium' : 'free';
  const limit = tier === 'premium' ? premiumLimit : freeLimit;

  // Read user identifier (fallback to client IP if not provided)
  const userId = request.headers.get('X-User-Id') ||
                 request.headers.get('CF-Connecting-IP') ||
                 'anonymous';

  return { userId, tier, limit, freeLimit, premiumLimit };
}

// ── CORS Headers ──
function corsHeaders(origin, extraHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id, X-User-Tier, X-User-Email',
    'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-User-Tier',
    'Access-Control-Max-Age': '86400',
    ...extraHeaders,
  };
}

function jsonResponse(data, status = 200, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin, extraHeaders),
    },
  });
}

function errorResponse(message, status = 400, origin, extraHeaders = {}) {
  return jsonResponse({ error: true, message }, status, origin, extraHeaders);
}

// ── Active Google Gemini Configuration ──
// Single active model configuration for MR.SALL AI Platform
const GEMINI_CONFIG = {
  model: 'gemini-3.8-flash',
  apiVersion: 'v1beta',
  maxOutputTokens: 2048,
};

/**
 * Sanitize error messages to guarantee no API keys or secrets are leaked
 */
function sanitizeErrorMessage(errMsg, apiKey) {
  if (!errMsg) return 'Unknown error';
  let sanitized = String(errMsg);
  if (apiKey) {
    sanitized = sanitized.split(apiKey).join('[REDACTED_API_KEY]');
  }
  return sanitized.replace(/key=[A-Za-z0-9_-]{20,}/g, 'key=[REDACTED_API_KEY]');
}

/**
 * Construct the official Google Gemini API endpoint for content generation
 */
function getGeminiEndpoint(apiKey) {
  return `https://generativelanguage.googleapis.com/${GEMINI_CONFIG.apiVersion}/models/${GEMINI_CONFIG.model}:generateContent?key=${apiKey}`;
}

// ── Gemini API Call ──
async function callGemini(env, promptOrContents, systemInstruction = '') {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in Cloudflare Worker Secrets.');
  }

  const endpointUrl = getGeminiEndpoint(env.GEMINI_API_KEY);

  let contents;
  if (Array.isArray(promptOrContents)) {
    contents = promptOrContents;
  } else {
    contents = [{ role: 'user', parts: [{ text: String(promptOrContents) }] }];
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const rawErr = await res.text();
    const safeErr = sanitizeErrorMessage(rawErr, env.GEMINI_API_KEY);

    let userMessage = `Gemini API error (HTTP ${res.status}): ${safeErr}`;
    if (res.status === 400) {
      userMessage = `Gemini API request was invalid (HTTP 400): ${safeErr}`;
    } else if (res.status === 401) {
      userMessage = 'Unauthorized (HTTP 401): Invalid GEMINI_API_KEY. Please verify your Cloudflare Worker secret.';
    } else if (res.status === 403) {
      userMessage = `Forbidden (HTTP 403): Your GEMINI_API_KEY lacks permissions or region access for ${GEMINI_CONFIG.model}.`;
    } else if (res.status === 404) {
      userMessage = `Model not found (HTTP 404): Endpoint for '${GEMINI_CONFIG.model}' was not found for API version ${GEMINI_CONFIG.apiVersion}.`;
    } else if (res.status === 429) {
      userMessage = 'Google Gemini rate limit exceeded (HTTP 429). Please wait a moment and try again.';
    } else if (res.status >= 500) {
      userMessage = `Google Gemini service temporarily unavailable (HTTP ${res.status}). Service is experiencing downtime.`;
    }
    throw new Error(userMessage);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const textParts = parts
    .filter(p => p && typeof p.text === 'string' && !p.thought)
    .map(p => p.text);

  const text = textParts.length > 0
    ? textParts.join('\n')
    : parts.map(p => p.text || '').filter(Boolean).join('\n');

  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    if (blockReason) {
      throw new Error(`Gemini response blocked or incomplete: ${blockReason}`);
    }
    throw new Error('Empty response from Gemini');
  }
  return text;
}

// ── Tool Handlers ──

// 1. Chat API Handler (Supports multi-turn)
async function handleChat(request, env, origin, usageHeaders) {
  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return errorResponse('Invalid messages array', 400, origin, usageHeaders);
  }

  // Map messages to Gemini multi-turn format (last 12 turns)
  const formattedContents = messages
    .slice(-12)
    .filter(m => m && typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const systemInstruction = `You are MR.SALL AI, an intelligent, helpful, and versatile AI assistant created by SALIH ABDELQAYOUM BACHIKH. 
Be concise, accurate, polite, and helpful. Always respond in the language used by the user (Arabic, English, or French).`;

  const content = await callGemini(env, formattedContents, systemInstruction);
  return jsonResponse({ content }, 200, origin, usageHeaders);
}

// 2. Writer API Handler
async function handleWrite(request, env, origin, usageHeaders) {
  const { type, topic, tone, lang } = await request.json();
  if (!topic || topic.length > 4000) return errorResponse('Invalid topic or text too long', 400, origin, usageHeaders);

  const langNames = { en: 'English', ar: 'Arabic', fr: 'French' };
  const langName = langNames[lang] || 'English';

  const prompts = {
    article: `Write a well-structured ${tone} article about: "${topic}". Write in ${langName}.`,
    email: `Write a ${tone} professional email about: "${topic}". Write in ${langName}.`,
    rewrite: `Rewrite the following text in a ${tone} style. Write in ${langName}:\n\n${topic}`,
    summary: `Summarize the following text concisely. Write in ${langName}:\n\n${topic}`,
    improve: `Improve and enhance the following text, making it more polished and ${tone}. Write in ${langName}:\n\n${topic}`,
  };

  const prompt = prompts[type] || prompts.article;
  const content = await callGemini(env, prompt);
  return jsonResponse({ content }, 200, origin, usageHeaders);
}

// 3. Translator API Handler
async function handleTranslate(request, env, origin, usageHeaders) {
  const { text, from, to } = await request.json();
  if (!text || text.length > 6000) return errorResponse('Invalid text or text too long', 400, origin, usageHeaders);

  const langNames = { en: 'English', ar: 'Arabic', fr: 'French', auto: 'the detected language' };
  const fromName = langNames[from] || from;
  const toName = langNames[to] || to;

  const prompt = `Translate the following text from ${fromName} to ${toName}. 
Preserve natural tone, idioms, and context. Return ONLY the translation, nothing else.\n\nText:\n${text}`;

  const content = await callGemini(env, prompt);
  return jsonResponse({ content }, 200, origin, usageHeaders);
}

// 4. Study API Handler
async function handleStudy(request, env, origin, usageHeaders) {
  const { mode, content: material, lang } = await request.json();
  if (!material || material.length > 6000) return errorResponse('Invalid study material or text too long', 400, origin, usageHeaders);

  const langNames = { en: 'English', ar: 'Arabic', fr: 'French' };
  const langName = langNames[lang] || 'English';

  const prompts = {
    explain: `Explain the following concept clearly and in simple terms with examples. Respond in ${langName}:\n\n${material}`,
    summarize: `Summarize the following educational material into clear key takeaways and bullet points. Respond in ${langName}:\n\n${material}`,
    questions: `Generate 10 practice questions with complete answers and explanations based on this material. Respond in ${langName}:\n\n${material}`,
    plan: `Create a structured study plan for learning: "${material}". Include timeline, milestones, and practice goals. Respond in ${langName}.`,
    stepbystep: `Explain the following step by step with numbered instructions. Respond in ${langName}:\n\n${material}`,
  };

  const prompt = prompts[mode] || prompts.explain;
  const result = await callGemini(env, prompt);
  return jsonResponse({ content: result }, 200, origin, usageHeaders);
}

// 5. Image API Handler (Stability AI)
async function handleImage(request, env, origin, usageHeaders) {
  const { prompt, style } = await request.json();
  if (!prompt || prompt.length > 1000) return errorResponse('Invalid prompt', 400, origin, usageHeaders);

  if (!env.STABILITY_API_KEY) {
    return errorResponse(
      'Image generation API not configured on server. Add STABILITY_API_KEY to your Cloudflare Worker secrets.',
      503,
      origin,
      usageHeaders
    );
  }

  const enhancedPrompt = `${prompt}, ${style || 'photorealistic'} style, high quality, 8k, masterpiece`;

  const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.STABILITY_API_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text_prompts: [{ text: enhancedPrompt, weight: 1 }],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      steps: 30,
      samples: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stability AI error: ${res.status} — ${err}`);
  }
  const data = await res.json();
  const base64 = data?.artifacts?.[0]?.base64;
  if (!base64) throw new Error('No image returned from Stability AI');

  return jsonResponse({ url: `data:image/png;base64,${base64}` }, 200, origin, usageHeaders);
}

// 6. Code API Handler
async function handleCode(request, env, origin, usageHeaders) {
  const { mode, language, content: userContent } = await request.json();
  if (!userContent || userContent.length > 6000) return errorResponse('Invalid code or content too long', 400, origin, usageHeaders);

  const lang = language || 'JavaScript';
  const prompts = {
    generate: `Generate clean, robust, modern ${lang} code for the following request. Include concise comments and follow best practices:\n\n${userContent}`,
    explain: `Explain the following ${lang} code thoroughly. Explain what each part does, edge cases, and time/space complexity:\n\`\`\`${lang}\n${userContent}\n\`\`\``,
    debug: `Debug the following ${lang} code. Identify bugs, potential flaws, performance issues, and provide the corrected code:\n\`\`\`${lang}\n${userContent}\n\`\`\``,
  };

  const prompt = prompts[mode] || prompts.generate;
  const content = await callGemini(env, prompt);
  return jsonResponse({ content }, 200, origin, usageHeaders);
}

// 7. PDF API Handler
async function handlePDF(request, env, origin, usageHeaders) {
  const { action, text, question } = await request.json();
  if (!text || text.length > 25000) return errorResponse('Invalid document content or document exceeds 25,000 characters', 400, origin, usageHeaders);

  const truncated = text.substring(0, 16000);
  const prompts = {
    ask: `Based strictly on the following document content, answer this question clearly: "${question}"\n\nDocument:\n${truncated}`,
    summarize: `Provide an executive summary and detailed key takeaways of the following document:\n\n${truncated}`,
  };

  const prompt = prompts[action] || prompts.summarize;
  const content = await callGemini(env, prompt);
  return jsonResponse({ content }, 200, origin, usageHeaders);
}

// ── Main Cloudflare Worker Export ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const path = url.pathname;

    // 1. Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 2. Health check endpoint (GET /api/health)
    if (request.method === 'GET' && path === '/api/health') {
      const resetSeconds = getSecondsUntilMidnightUTC();
      const freeLimit = parseInt(env.FREE_DAILY_LIMIT || '50', 10);
      const premiumLimit = parseInt(env.PREMIUM_DAILY_LIMIT || '500', 10);

      return jsonResponse({
        status: 'ok',
        service: 'MR.SALL AI Platform',
        version: '2.0.0',
        configured: Boolean(env.GEMINI_API_KEY),
        gemini_model: GEMINI_CONFIG.model,
        image_configured: Boolean(env.STABILITY_API_KEY),
        limits: {
          free_daily_limit: freeLimit,
          premium_daily_limit: premiumLimit,
        },
        storage: env.USAGE_KV ? 'Cloudflare KV' : 'In-Memory Store',
        server_time_utc: new Date().toISOString(),
        reset_seconds: resetSeconds,
      }, 200, origin);
    }

    // 3. User usage status query endpoint (/api/usage) - DOES NOT consume a message credit
    if (path === '/api/usage') {
      const { userId, tier, limit } = resolveUserLimits(env, request);
      const today = getTodayDateKey();
      const resetSeconds = getSecondsUntilMidnightUTC();
      const currentUsage = await getDailyUsage(env, userId, today);
      const remaining = Math.max(0, limit - currentUsage);
      const usageHeaders = {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(resetSeconds),
        'X-User-Tier': tier,
      };
      return jsonResponse({
        user_id: userId,
        tier,
        date: today,
        used: currentUsage,
        limit,
        remaining,
        reset_seconds: resetSeconds,
      }, 200, origin, usageHeaders);
    }

    // 4. API Tool Endpoints (all /api/* requests)
    if (path.startsWith('/api/')) {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, origin);
      }

      // Short-term IP burst rate limiting (30 requests/minute)
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!checkBurstRateLimit(ip, 30, 60000)) {
        return errorResponse('Rate limit exceeded. Please wait a moment before sending more requests.', 429, origin);
      }

      const { userId, tier, limit } = resolveUserLimits(env, request);
      const today = getTodayDateKey();
      const resetSeconds = getSecondsUntilMidnightUTC();

      // Backend-enforced Daily Usage Limits Check
      const currentUsage = await getDailyUsage(env, userId, today);
      if (currentUsage >= limit) {
        const usageHeaders = {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetSeconds),
          'X-User-Tier': tier,
        };
        return jsonResponse({
          error: true,
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `Daily limit of ${limit} requests reached. Your quota resets at midnight UTC.`,
          limit,
          used: currentUsage,
          remaining: 0,
          reset_seconds: resetSeconds,
          tier,
        }, 429, origin, usageHeaders);
      }

      // Verify Gemini API key configuration
      if (!env.GEMINI_API_KEY && path !== '/api/image') {
        return errorResponse('AI service is not configured on the server. Please add GEMINI_API_KEY to Worker secrets.', 503, origin);
      }

      // Prepare response usage headers for successful requests
      const newUsage = currentUsage + 1;
      const remainingAfter = Math.max(0, limit - newUsage);
      const usageHeaders = {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remainingAfter),
        'X-RateLimit-Reset': String(resetSeconds),
        'X-User-Tier': tier,
      };

      try {
        let response;
        if (path === '/api/chat') response = await handleChat(request, env, origin, usageHeaders);
        else if (path === '/api/write') response = await handleWrite(request, env, origin, usageHeaders);
        else if (path === '/api/translate') response = await handleTranslate(request, env, origin, usageHeaders);
        else if (path === '/api/study') response = await handleStudy(request, env, origin, usageHeaders);
        else if (path === '/api/image') response = await handleImage(request, env, origin, usageHeaders);
        else if (path === '/api/code') response = await handleCode(request, env, origin, usageHeaders);
        else if (path === '/api/pdf') response = await handlePDF(request, env, origin, usageHeaders);
        else return errorResponse('API endpoint not found', 404, origin, usageHeaders);

        // On successful processing, record the incremented daily usage
        if (response && response.status === 200) {
          await recordDailyUsage(env, userId, today, newUsage);
        }

        return response;
      } catch (err) {
        console.error('Worker processing error:', err);
        return errorResponse(
          err.message || 'AI service temporarily unavailable. Please try again.',
          500,
          origin,
          usageHeaders
        );
      }
    }

    // 5. Frontend & Static Assets (GET / and all other non-API routes)
    // Cloudflare Workers Static Assets binding (env.ASSETS) serves index.html,
    // login.html, founder.html, privacy.html, CSS, JS, tools, and PWA assets.
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      try {
        let assetRes = await env.ASSETS.fetch(request);

        // Pretty URLs fallback: if 404 and path has no file extension (e.g. /login, /founder)
        if (assetRes.status === 404 && !path.includes('.')) {
          const prettyPath = `${path.replace(/\/+$/, '')}.html`;
          const prettyUrl = new URL(prettyPath, request.url);
          const prettyRes = await env.ASSETS.fetch(new Request(prettyUrl, request));
          if (prettyRes.ok) {
            assetRes = prettyRes;
          }
        }

        // Add Service-Worker-Allowed header if serving service-worker.js
        if (path === '/service-worker.js' || path.endsWith('/service-worker.js')) {
          const newHeaders = new Headers(assetRes.headers);
          newHeaders.set('Service-Worker-Allowed', '/');
          return new Response(assetRes.body, {
            status: assetRes.status,
            statusText: assetRes.statusText,
            headers: newHeaders,
          });
        }

        return assetRes;
      } catch (assetErr) {
        console.error('Error fetching static asset:', assetErr);
      }
    }

    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};

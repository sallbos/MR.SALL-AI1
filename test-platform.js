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

// Summary
console.log('\n==============================================');
console.log(`AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log('==============================================');

if (failed > 0) {
  process.exit(1);
}

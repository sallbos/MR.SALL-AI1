# MR.SALL AI — Complete AI Platform

> **Your Intelligence. Your Tools. Your Future.**  
> Created by **SALIH ABDELQAYOUM BACHIKH**

A modern, commercial-grade, fully functional AI platform featuring 7 specialized AI tools, Google Identity authentication, an interactive User Dashboard, backend-enforced daily usage limits, complete Progressive Web App (PWA) installation across all operating systems, and trilingual support (Arabic RTL, English, French).

---

## 📁 Project Architecture & File Structure

```
MR-SALL-AI/
├── index.html              # Main platform dashboard & tools showcase (protected)
├── founder.html            # Salih Abdelqayoum Bachikh — Founder Profile Page
├── login.html              # Google Sign-In & Guest authentication gateway
├── offline.html            # Branded offline fallback screen
├── privacy.html            # Privacy Policy
├── terms.html              # Terms of Service
├── manifest.webmanifest    # PWA Web App Manifest (standalone, icons, shortcuts)
├── manifest.json           # Manifest alias for legacy browser compatibility
├── service-worker.js       # PWA Service Worker (App Shell caching & offline)
├── server.js               # Zero-dependency local Node.js development server
├── test-platform.js        # Automated verification test suite (64 assertions)
├── wrangler.toml           # Cloudflare Worker configuration & KV bindings
├── css/
│   └── style.css           # Complete stylesheet (themes, RTL, PWA, dashboard, responsive)
├── js/
│   ├── app.js              # Application bootstrap, dashboard & settings modal
│   ├── auth.js             # Google Identity Services & session manager
│   ├── pwa.js              # PWA lifecycle manager (install prompts & updates)
│   ├── theme.js            # Dark & Light theme manager
│   ├── language.js         # Multilingual engine — Arabic (RTL), English, French
│   └── tools.js            # All 7 AI tools + UsageTracker + API abstraction layer
├── assets/
│   ├── favicon.png         # Brand favicon (64x64)
│   ├── logo.png            # Official square logo emblem (450x450)
│   ├── mascot.jpg          # Official hooded hacker mascot artwork (original)
│   ├── mascot.png          # High-resolution mascot artwork (PNG)
│   ├── icons/              # 7 custom SVG icons for AI tools
│   │   ├── chat.svg, writer.svg, translator.svg, study.svg, image.svg, code.svg, pdf.svg
│   └── icons/pwa/          # 12 PWA icons + 2 responsive screenshots
│       ├── icon-72x72.png, icon-96x96.png, icon-128x128.png, icon-144x144.png
│       ├── icon-152x152.png, icon-192x192.png, icon-384x384.png, icon-512x512.png
│       ├── icon-maskable-512x512.png, apple-touch-icon.png
│       ├── screenshot-desktop.png (1280x720)
│       └── screenshot-mobile.png (720x1280)
├── tools/
│   ├── chat.html           # AI Chat interface
│   ├── writer.html         # AI Writer interface
│   ├── translator.html     # AI Translator interface
│   ├── study.html          # AI Study interface
│   ├── image.html          # AI Image generator interface
│   ├── code.html           # AI Code interface
│   └── pdf.html            # PDF Assistant interface (PDF.js client extraction)
└── worker/
    └── index.js            # Cloudflare Worker backend (Gemini 1.5 Flash + Stability AI)
```

---

## 🚀 Running Locally

### Option 1 — Built-in Local Server (Recommended)
```bash
cd MR-SALL-AI
node server.js
```
Open **`http://localhost:3000`** in any web browser.  
Unauthenticated users land directly on `login.html`, and after clicking **Continue with Google** or **Continue as Guest**, proceed into the main dashboard.

### Option 2 — Automated Quality Audit
Verify the integrity of all JavaScript syntax, required assets, i18n dictionaries, security secrets, and internal hyperlinks:
```bash
cd MR-SALL-AI
node test-platform.js
```

---

## ⚡ Daily Usage Limits & Quota Engine

MR.SALL AI features a backend-enforced daily message quota system:

- **Free Tier**: 50 AI requests per day (configurable via Worker env var `FREE_DAILY_LIMIT`).
- **Premium Tier**: 500 AI requests per day (configurable via Worker env var `PREMIUM_DAILY_LIMIT`).
- **Backend Enforcement**: Limits are checked and tracked inside `worker/index.js` using Cloudflare KV (`USAGE_KV`) or an in-memory Map fallback. Requests beyond quota return HTTP `429`.
- **Response Headers**: Every AI response sends:
  - `X-RateLimit-Limit`: Maximum daily messages.
  - `X-RateLimit-Remaining`: Messages remaining today.
  - `X-RateLimit-Reset`: Seconds until 00:00 UTC midnight.
  - `X-User-Tier`: `free` or `premium`.
- **Live User Dashboard**: Displays messages used today, messages remaining, daily limit, and an animated progress bar.
- **Frontend Quota Badges**: Dynamic pills in the navbar (`⚡ 50/50 left`) update in real time on every request.

---

## 📱 Progressive Web App (PWA) Installation

MR.SALL AI can be installed as a native app on all platforms without downloading APKs or installers:

- **Android (Chrome / Edge / Samsung Internet)**: Click the **⚡ Install App** button in the navbar or banner.
- **iOS & iPadOS (Safari)**: Tap the **Share** button, scroll down, and select **Add to Home Screen**. A built-in modal provides step-by-step guidance.
- **Windows & macOS (Chrome / Edge / Brave)**: Click the **⚡ Install App** button in the navbar or the browser address bar icon.
- **Offline Resilience**: The Service Worker precaches the entire application shell. If internet access is lost, a branded `offline.html` screen appears with an automatic reconnection detector.

---

## ⚙️ Cloudflare Worker Backend Setup

### Step 1 — Get API Keys
1. **Google Gemini**: Get a free API key at [Google AI Studio](https://aistudio.google.com).
2. **Stability AI** *(Optional)*: Get a key for the AI Image tool at [platform.stability.ai](https://platform.stability.ai).

### Step 2 — Deploy the Worker
```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login to your Cloudflare account
wrangler login

# 3. Add your Gemini API Key as an encrypted secret
cd MR-SALL-AI
wrangler secret put GEMINI_API_KEY
# Paste your Gemini API key

# 4. (Optional) Add Stability AI Key for image generation
wrangler secret put STABILITY_API_KEY

# 5. (Optional) Create KV namespace for multi-isolate quota persistence
wrangler kv:namespace create USAGE_KV
# Paste the generated namespace ID into wrangler.toml under [[kv_namespaces]]

# 6. Deploy to Cloudflare's Global Network
wrangler deploy
```

### Step 3 — Connect Frontend to Worker
Open MR.SALL AI in your browser, click **⚙️ Settings** in the navbar, paste your deployed Worker URL (e.g., `https://mrsall-ai.your-subdomain.workers.dev`), and click **Test Connection**.

---

## 🔑 Google Authentication Setup (Google Identity Services)

1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Application type: **Web application**).
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local testing)
   - `https://your-domain.pages.dev` (for production)
4. Copy the generated Client ID.
5. In MR.SALL AI, open **⚙️ Settings**, paste your Client ID under **Google OAuth Client ID**, and click **Save Settings**.
6. Users can now sign in with their Google accounts or click **Continue as Guest** for instant access without a Google account.

---

## 🌐 Deploying to Cloudflare Pages (Frontend)

1. In the [Cloudflare Dashboard](https://dash.cloudflare.com), navigate to **Compute (Workers) > Workers & Pages > Create application > Pages > Connect to Git** (or **Direct Upload**).
2. Drag and drop the `MR-SALL-AI` folder (excluding `worker/` and `node_modules/` if any) or link your GitHub repository.
3. Set the build output directory to `/`.
4. Deploy! Your site will be live instantly on a `*.pages.dev` subdomain with free SSL and global CDN caching.

---

## 🛠️ The 7 AI Tools

| Tool | Endpoint | Model / Technology | Description |
|---|---|---|---|
| **AI Chat** | `/api/chat` | Gemini 1.5 Flash | Multi-turn conversational assistant with Markdown |
| **AI Writer** | `/api/write` | Gemini 1.5 Flash | Articles, emails, summaries, and creative rewrites |
| **AI Translator** | `/api/translate` | Gemini 1.5 Flash | High-accuracy Arabic, English, and French translation |
| **AI Study** | `/api/study` | Gemini 1.5 Flash | Educational explanations, practice questions, study plans |
| **AI Image** | `/api/image` | Stability SDXL | Text-to-image generator with 8 artistic style presets |
| **AI Code** | `/api/code` | Gemini 1.5 Flash | Code generation, debugging, and line-by-line explanation |
| **PDF Assistant** | `/api/pdf` | PDF.js + Gemini | Client-side text extraction, document summaries, and Q&A |

---

## 👤 About the Founder

Visit `founder.html` to view the comprehensive profile of **SALIH ABDELQAYOUM BACHIKH**, creator of MR.SALL AI:
- **Philosophy**: *"Technology is not just about using tools, but about understanding them, creating with them, and using them to build something meaningful."*
- **Passion Fields**: Artificial Intelligence, Game Development, Web Development, Cybersecurity, and Innovation.
- **Projects Portfolio**: MR.SALL AI, MR.SALL (Security Brand), SALIH GAMING (Game Studio), and SALIH ADVENTURE (2D Pixel-Art Game).

---

## 📄 License

© 2024 MR.SALL AI. All rights reserved. Created with passion by Salih Abdelqayoum Bachikh.

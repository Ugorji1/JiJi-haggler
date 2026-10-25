# 🤖 Jiji AI Marketplace Haggler (Universal Engine v8.6)

An autonomous, multi-seller AI marketplace negotiator and switchboard engineered for **[Jiji.ng](https://jiji.ng)** (and Jiji Kenya). 

The haggler runs **concurrent, human-paced negotiations across multiple sellers simultaneously**, adhering to realistic Nigerian market bargaining conventions, prioritizing local sellers, disambiguating physical shop addresses from bank details, and routing final deals to a **human-in-the-loop Telegram approval gateway**.

---

## 🎬 Live Demonstration

Watch the AI Haggler autonomously scout listings, negotiate with multiple sellers concurrently, pace human-like responses, and send real-time deal approval cards to Telegram:

<p align="center">
  <video src="assets/demo.mp4" controls="controls" width="100%" style="max-height: 520px; border-radius: 8px;">
    Your browser does not support the video tag.
  </video>
</p>

> 📹 **Video File:** [`assets/demo.mp4`](assets/demo.mp4) (Click to play or download)

---

## 🌟 Key Architecture & Capabilities

```
                  ┌──────────────────────────────────────────────┐
                  │             Jiji.ng Marketplace              │
                  │ (Live Listings, SPA Messenger, Vue WebSockets)│
                  └──────────────────────┬───────────────────────┘
                                         │
                         Tampermonkey Userscript (v8.6)
                 ┌───────────────────────┴───────────────────────┐
                 │ • Floating HUD Dashboard                      │
                 │ • Real-time DOM Scraper & MutationObserver    │
                 │ • Multi-Seller Inbox Switchboard              │
                 │ • Human Pacing (4–7s delays, gesture events)  │
                 └───────────────────────┬───────────────────────┘
                                         │ HTTP REST
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │           Node.js Express Backend            │
                 │                (server.js)                   │
                 └──────┬───────────────┬───────────────┬───────┘
                        │               │               │
        ┌───────────────▼──────┐ ┌──────▼────────┐ ┌────▼─────────────┐
        │  Google Gemini 3.5   │ │ Telegram Bot  │ │   Session Store   │
        │ Sub-Second Cascade   │ │ Approval Gate │ │   (store.js &     │
        │      (ai.js)         │ │ (telegram.js) │ │   sessions.json)  │
        └──────────────────────┘ └───────────────┘ └───────────────────┘
```

### 1. Multi-Seller Inbox Switchboard (`jiji_haggler.user.js`)
* **Concurrent 3-Seller Outreach:** Searches and pitches up to 3 candidate sellers within your budget concurrently.
* **Golden Rule Enforcement:** The seller must *never* be the last person to speak. The bot stays locked on the active chat until our reply is evaluated, typed, and sent.
* **Snippet-Based Switchboard:** Automatically detects when another seller has replied in the sidebar (even if Jiji hasn't rendered a green unread badge) by comparing sidebar preview snippets.
* **Loading State Protection:** Waits up to 4.5s for Jiji's asynchronous message bubbles to mount before inspecting turns, eliminating chat-switching loops.

### 2. Sub-Second AI Negotiator (`ai.js`)
* **Lightning Latency Cascade:** Benchmarked on Gemini Flash models:
  * Primary: `gemini-3.5-flash-lite` (~850ms response time).
  * Failover: `gemini-3.1-flash-lite` (~1.1s response time).
* **Authentic Nigerian Market Persona:** Speaks natural Nigerian English / everyday market phrases (*"boss"*, *"senior man"*, *"cash ready"*, *"clean grade"*).
* **Shorthand Price Recognition:** Understands shorthand figures like *"530"* or *"850"* as ₦530k and ₦850k in high-ticket electronics.
* **Zero Amnesia (Live DOM History):** Scrapes the entire conversation bubble history on every turn. Gemini always sees the full context and will never repeat already answered questions or re-ask for last prices.

### 3. Smart Deal Classification & Address Disambiguation (`server.js`)
* **Physical Shop Address Detection:** Accurately classifies physical shops in Computer Village (Ikeja), Igbogbo (Ikorodu), Yaba, etc., as **🏬 In-Shop Inspection / Pickup**.
* **Landmark Disambiguation:** Understands that phrases like *"beside Stanbic Bank"* or *"opposite Zenith"* in a street address are location landmarks, preventing false bank account classification.
* **Interstate Waybill Routing:** Identifies motor park couriers (Peace Mass, GIGM, ABC Transport) when buyer and seller reside in different states.
* **Anti-Spam Guard:** When a seller acknowledges a proposed deal (*"Okay"*, *"Alright"*, *"Noted"*), the engine stays silent and will not spam repetitive holding messages.

### 4. Telegram Human-in-the-Loop Gateway (`telegram.js`)
* **Instant Verification Card:** Dispatches a structured deal review card with agreed price, seller phone, and shop/bank details.
* **One-Click Decisions:**
  * `[✅ Approve & Pay]`: Locks the winner and politely stands down competing sellers.
  * `[⚡ Push Lower (Bluff)]`: Automatically attempts one final bluff discount step.
  * `[❌ Pass / Drop Deal]`: Drops the seller and continues with remaining candidates.
* **Remote Commands:** Trigger new hunts directly from Telegram: `/hunt iphone 13 450000` or natural language messages (*"Find me an Oraimo 10,000mah power bank under 15k"*).

---

## 📂 Repository Structure

```
.
├── server.js               # Main Express backend, API endpoints, orchestration
├── ai.js                   # Gemini sub-second AI negotiation engine & persona
├── store.js                # Session persistence & hunt cohort state manager
├── telegram.js             # Telegram long-polling bot & interactive approval cards
├── azza.js                 # Azza payout gateway client
├── jiji_haggler.user.js    # Tampermonkey userscript (v8.6) with floating HUD
├── simulator.js            # Standalone offline simulation engine (3 synthetic sellers)
├── package.json            # Project manifest & npm scripts
├── .env.example            # Environment template with credential instructions
├── .gitignore              # Ignores .env, node_modules, and runtime sessions.json
├── assets/
│   └── demo.mp4            # Live engine demonstration video
└── public/
    ├── index.html          # Web testing dashboard & offline simulator UI
    └── mock-jiji-listing.html # Offline mock listing page for DOM testing
```

---

## 🚀 Getting Started

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18.0.0 or higher)
* [Tampermonkey Extension](https://www.tampermonkey.net/) installed in your browser (Chrome, Brave, Edge, or Firefox).

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/<your-username>/jiji-ai-haggler.git
cd jiji-ai-haggler
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your credentials:
```env
PORT=5000

# Google Gemini API Key (Get a free key at https://aistudio.google.com/)
GEMINI_API_KEY=AIzaSy...

# Telegram Bot (Create a bot via @BotFather on Telegram)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRstuVWXyz
# Your numeric Telegram Chat ID (obtain by messaging @userinfobot)
TELEGRAM_CHAT_ID=123456789

# Optional: Azza Payout Gateway
AZZA_PHONE_NUMBER=2349000000000
RATE_NGN=1520
RATE_KES=130
```

### 4. Start the Backend Server
```bash
npm start
```
The server will start on `http://localhost:5000` and display:
```
========================================
  Jiji AI Haggler Engine v8.6 Active!
  Local Server: http://localhost:5000
  Telegram Bot: @YourBot Online
========================================
```

### 5. Install the Tampermonkey Userscript
1. Open your browser with Tampermonkey installed.
2. Navigate to: **`http://localhost:5000/jiji_haggler.user.js`**
3. Tampermonkey will open an installation tab. Click **Install** (or **Update**).

---

## 🎯 How to Use

### Method A: Start a Hunt via Telegram
Send a message to your Telegram bot:
```
/hunt oraimo power bank 10000mah 15000
```
Or in plain conversational English:
> *"Help me find a clean UK used OnePlus 8T with 256GB storage, my maximum budget is 240,000 in Lagos"*

The bot will set the active hunt and notify the userscript.

### Method B: Start a Hunt via Jiji Browser HUD
1. Navigate to **[jiji.ng](https://jiji.ng)**.
2. The dark **Azza Haggler HUD** will appear in the top-right corner.
3. Type your query (e.g. `Lenovo Legion 5`) and maximum budget (e.g. `450000`).
4. Click **🚀 START AUTO-HUNT**.

### Multi-Seller Haggling in Action
1. The script searches Jiji, filters for sellers in your region first (falling back nationwide if needed), and opens up to 3 candidate listings.
2. It generates a bespoke opening pitch (10–15% discount) and opens the chat.
3. It monitors all conversations through the `/profile-messages` switchboard.
4. When sellers respond with shop addresses or bank accounts, the bot sends the holding note:
   > *"Make I quickly arrange and verify the payment now, I get back to you once done"*
5. Telegram instantly alerts you with the structured verification card for approval!

---

## 🧪 Offline Simulator (Test Without Live Jiji)

You can run an end-to-end multi-seller test simulation completely offline:
```bash
npm run simulate
```
This spawns 3 synthetic sellers with varying personalities (firm seller, flexible seller, and quality defender) and exercises the entire negotiation and Telegram approval cycle in console output.

---

## 🔒 Security & Safety Guidelines

* **Never commit `.env` or `sessions.json`** to public source control. Keep `.gitignore` intact.
* **Human-in-the-Loop:** The bot never executes financial payouts autonomously; all deals require explicit human approval via Telegram or the HUD.
* **Rate-Limit Pacing:** The userscript includes natural human typing delays (4.5s to 7.0s) and gesture event dispatchers (`pointerdown`, `mousedown`, `click`) to ensure smooth operation within Jiji's Vue SPA.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

# 💬 Friendship Helper

Tell an AI what your friend said (or drop a screenshot of the chat), or what *you* want to say, and get messages you can copy and send, in any of **100 styles**.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer and a key for one of the AIs below (there are free ones).

```bash
npm install
npm start
```

Open **http://localhost:3000** and tap **🔌 Connect an AI**. The setup walks you through getting a key and then checks it works (the check doesn't use up anything). For Claude you can also start the server with the key set (`ANTHROPIC_API_KEY=sk-ant-... npm start`) and skip that step.

## 🔌 Which AI?

Pick one in the setup screen or in ⚙️ Settings → AI connection. You bring your own key; nothing is built into the app.

| AI | Cost | Get a key | Default model |
|---|---|---|---|
| 🆓 **Google Gemini** | Free tier with daily limits | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-3.5-flash-lite` (reads screenshots) |
| 🆓 **Groq** | Free plan, about 1,000 requests a day | [console.groq.com/keys](https://console.groq.com/keys) | `openai/gpt-oss-120b`, or `qwen/qwen3.8-27b` when you attach a screenshot |
| 🆓 **OpenRouter** | Free models (ids ending in `:free`) with daily limits | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | `google/gemma-4-31b-it:free` (reads screenshots) |
| 💳 **Claude** | Pay-as-you-go, best quality | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | `claude-opus-5-5` |

- Free models come and go. If one stops working, type a different model name in Settings (leave it empty to use the default).
- ⚠️ **Free tiers may keep what you send.** Google's free tier uses it to improve its products, and others may log it. Avoid sending screenshots with private info to free AIs.
- Paste a key into the setup screen and the app recognises which service it's from and switches to it.

## 📱 Android app (.apk)

The Android app is the same app packaged with [Capacitor](https://capacitorjs.com). It doesn't need the Node server: the phone talks directly to the AI you picked, using your key. The key stays on your phone and is only sent to that AI's service.

**Install:** copy `FriendshipHelper.apk` to your phone, open it, and allow "install unknown apps" when Android asks. The build is signed with a debug key. If you later install a version built on a different computer, uninstall the old one first.

**Build it yourself.** You need Node 22+, JDK 21 and the Android SDK (Android Studio includes it):

```bash
npm install
npm run android:apk      # → android/app/build/outputs/apk/debug/app-debug.apk
# or: npm run android:sync && npm run android:open   (build/run from Android Studio)
```

`npm run android:sync` bundles the Claude SDK into `public/vendor/claude-direct.js` and copies `public/` into the Android project. Run it after every change to the web files.

## What it does

- **Three modes**
  - 💬 **They said**: paste their message and get replies.
  - ✍️ **I want to say**: type it messy and get it said well.
  - 🤷 **Help me start**: describe the situation and get an opener.
- **Screenshots**: drop, paste (Ctrl+V) or pick up to 5 images of a chat. Claude reads the thread and works out which bubbles are yours.
- **100 styles** in 10 categories (Chill, Funny, Flirty, Serious, Fancy, Characters, Creative, Internet, Moods…). Pick up to 6 at once, ⭐ favorite them, search them, hit 🎲 *Surprise me*, or write your own ("like a sleepy cat who just learned English").
- **Controls**: 1–6 options, length (tiny to long), emoji amount, and style strength (subtle to max).
- **Friend profiles**: save each friend's relationship and notes (inside jokes, how they text) so replies fit them.
- **Sounds like you**: paste a few of your real texts in Settings and replies will match your slang and casing.
- **Refine**: tap *Shorter*, *Funnier*, *Nicer* and so on, type your own tweak, or press *More like this* on a card.
- **Library**: ⭐ saved messages and a history of past requests.
- **Language**: replies match the chat's language automatically, or you can pick one.

## 🎨 Themes

There are 16 presets: Midnight, Daylight, Bubblegum, Ocean, Forest, Sunset, Cyber Neon, Lavender, Coffee, Mono, Terminal, Candy, Aurora, Comic, High Contrast and Rosé. You can change everything:

- 10 colors (background, gradient, panels, inputs, text, accents, borders, message bubble)
- 11 fonts and text size
- corner roundness, bubble shape (rounded, pill, sharp, chat tail), spacing, shadow depth
- background type (solid, gradient, animated gradient, glow mesh, dots, grid, stripes), frosted glass panels and blur, animations on or off
- 🎲 Shuffle for a random readable theme
- save your own themes, and share them by copying or pasting a theme code

Everything (themes, friends, saved messages, settings) is stored in your browser. Use **Settings → Your data** to back it up or move it. Your API key is never included in the export.

## How it works

- `public/prompt.js` holds the prompt and answer format shared by every AI. `public/providers.js` calls the free AIs (Gemini, Groq, OpenRouter) straight from the browser or phone.
- `src/suggest.js` holds the Claude call, using the official Anthropic SDK (`@anthropic-ai/sdk`) with structured JSON output so every answer comes back as clean suggestion cards. Both versions share it:
  - the web version runs it inside `server.js`, a small Node server
  - the Android app bundles it from `src/direct.js` and runs it on the phone
- It uses `claude-opus-5-5` by default. Set `CLAUDE_MODEL` to change it and `PORT` to change the port.
- **Settings → Thinking speed** switches between Fast, Balanced and Thorough.
- Server-side fallback is on: if Claude's safety filter wrongly declines a harmless request, the API retries it on Anthropic's recommended fallback model.
- `public/` holds the whole UI as plain HTML, CSS and JS with no build step. The 100 styles live in `public/styles-data.js` and the themes in `public/themes.js`. Add your own there.

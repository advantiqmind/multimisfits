# Multi-Misfits -- Clan Website (CLAUDE.md)

Read this first. It's the full state of the project so you can continue without re-discovery.

When a task is finished, clean up this file: move completed items out of "What's left",
update the Status section, and keep the doc tight. Don't let it accumulate stale TODOs.

## What this is
A read-only website for the OSRS clan **Multi-Misfits**. Philosophy: the site is a
HUB that DISPLAYS data from tools the clan already uses. Nobody edits the website.
No CMS, no accounts, no forums, no application forms. Recruiting funnels to Discord.

Each content type has exactly ONE source. Never add a second way to edit something.
- News        -> a locked Discord #announcements channel (bot reads it)
- Events      -> Discord forum channel (bot reads threads; EventForge dates parsed)
- Achievements -> Discord "chest" channel (Dink plugin posts drops/pets/CAs)
- Giveaways   -> Discord giveaway forum channel (reaction-based entries, trophy winners)
- Roster/ranks/stats -> Wise Old Man (WOM) group, synced from in-game via RuneLite

## Stack (keep it this way)
- Plain HTML/CSS/JS. NO framework, NO build step. Mobile-friendly, desktop-primary.
- Cloudflare Pages (static) + Pages Functions (serverless) for anything needing a token.
- Dark, heavily OSRS/medieval theme. Fonts: Cinzel (titles) + Jersey 15 (game HUD).
- Owner works mostly on MOBILE -- keep single-file previews easy to view.

## Key IDs / constants
- WOM group ID: 26075  (https://wiseoldman.net/groups/26075)
- Discord invite: https://discord.gg/kT4vEGnjgU
- In-game clan: "MultiMisfits" (one word). Owner IGN: mr flsh.

## Files
- index.html                   homepage (hero, news, events, achievements, roster, gallery)
- guides.html / faq.html       content pages (FAQ has real content; Guides is "coming soon")
- roster.html                  full roster (data-full="1")
- ge.html                      Grand Exchange -- full-page iframe embed of 1box.online GE tool
- events.html                  Events + Giveaways tabs (hash-based: #giveaways persists on refresh)
- gate.html                    auth gate landing page (referral code + Discord OAuth)
- style.css                    theme
- app.js                       nav, toasts, Discord links, all panel rendering
- functions/_middleware.js     auth middleware (redirects unauthenticated to gate.html)
- functions/api/auth/login.js  POST validates referral code, returns OAuth URL; GET redirects to OAuth
- functions/api/auth/callback.js Discord OAuth callback, creates D1 session
- functions/api/auth/logout.js clears session cookie + D1 record
- functions/api/wom.js         GET /api/wom  -> WOM group, cached 6h, sorted roster
- functions/api/news.js        GET /api/news -> reads #announcements via Discord bot
- functions/api/events.js      GET /api/events -> reads forum threads (filters out giveaway threads), cached 5min
- functions/api/achievements.js GET /api/achievements -> reads chest channel (Dink posts), cached 5min
- functions/api/spotlight.js   GET /api/spotlight -> reads mod-only spotlight channel, returns latest image
- functions/api/giveaway.js    GET /api/giveaway -> reads giveaway forum channel, cached 1min; supports ?debug=1
- functions/api/referral.js    POST /api/referral -> validates referral codes, tracks redemptions in Discord forum thread
- functions/api/discord.js    Discord interactions endpoint (slash commands); GET = register commands
- assets/ranks/*.png           rank icons (official, upscaled 2x nearest)
- assets/gallery/shot1-6.webp  clan screenshots (static fallback for gallery page)
- test-*.mjs                   unit tests (6 files: wom, news, events, achievements, spotlight, giveaway)

## Env vars (Cloudflare Pages > Settings > Environment variables)
    DISCORD_BOT_TOKEN        (secret)
    ANNOUNCEMENTS_CHANNEL_ID (plain)
    CHEST_CHANNEL_ID         (plain)  <- achievements + gallery
    SPOTLIGHT_CHANNEL_ID     (plain)  <- gallery spotlight image (mod-only channel)
    DISCORD_GUILD_ID         (plain)  <- events + giveaways
    EVENTS_CHANNEL_ID        (plain)  <- events forum channel
    GIVEAWAY_CHANNEL_ID      (plain)  <- giveaway forum channel
    PUBLISH_REACTION         (optional, e.g. "check" emoji, to gate news)
    REFERRAL_CODES           (plain)  <- comma-separated codes, e.g. "TEQUILA,FLASH,KOI"
    DISCORD_INVITE           (plain, optional) <- override invite URL; defaults to hardcoded link
    REFERRAL_THREAD_ID       (plain, optional) <- forum thread ID for referral tracking
    DISCORD_PUBLIC_KEY       (plain) <- from Discord Developer Portal, for slash commands
    DISCORD_CLIENT_ID        (plain)  <- OAuth2 client ID from Discord Developer Portal
    DISCORD_CLIENT_SECRET    (secret) <- OAuth2 client secret

## Bindings (Cloudflare Pages > Settings > Functions)
    DB  ->  D1 database "multimisfits-auth"  (auth sessions table)

## Status
LIVE: Site deployed on Cloudflare Pages. Discord bot wired up. All pages, roster,
      events, giveaways, achievements, news, gallery, FAQ -- everything functional.

## What's left
Nothing pending.

## How things work

### Giveaways
- Each round = one forum thread. Leaders react with 1/2 keycap emoji on member
  screenshots to confirm entries (max 2 per person).
- Stats auto-calculated: total entries, participants, GP raised.
- Winner detected via trophy emoji in message: @mention > text after trophy
  (greeting words stripped, max 3 words) > message author. Pinned messages as fallback.
- Winner names are auto-capitalized (jackson -> Jackson).
- Auto end-date: active rounds without explicit Ends: line get start + 14 days.
- Live rounds show "Ends X" countdown. Scheduled rounds count down to start.
- Previous round winner spotlight always visible on current round card.
- Winner toast on homepage (dismissable, localStorage per winner).
- Giveaway threads filtered from events feed (by name containing "giveaway").
- Tab state persists via URL hash (#giveaways).

### Events
- Forum threads from events channel, excluding giveaway-named threads.
- EventForge date parsing: `When:` and `Ends:` lines (plain text or Discord timestamps).
- [LIVE] tag in thread name forces live status regardless of dates.
- Emoji-prefixed date lines supported (e.g. calendar emoji before When:).

### Authentication gate
- Every page except gate.html and static assets is protected by _middleware.js.
- First visit: gate.html shows referral code input + "Sign in with Discord" for returning users.
- New user flow: enter referral code -> POST /api/auth/login validates code, returns Discord
  OAuth URL, sets mm_referral_ok cookie -> Discord OAuth -> /api/auth/callback exchanges code
  for token, gets user info, checks mm_referral_ok cookie or existing D1 record -> creates
  session in D1, sets mm_session cookie (30-day expiry) -> redirect to site.
- Returning user flow: click "Sign in with Discord" -> GET /api/auth/login redirects to
  Discord OAuth -> callback checks discord_id exists in D1 -> new 30-day session.
- If D1 or DISCORD_CLIENT_ID not configured, middleware passes through (graceful degradation).
- D1 table: sessions (discord_id, discord_username, discord_avatar, referral_code,
  session_token, created_at, last_auth_at, expires_at).
- OAuth redirect URL: {origin}/api/auth/callback (must be registered in Discord Developer Portal).
- /inactives slash command: shows members who haven't authenticated in X days (default 30),
  with paginated list (25 per page) via Discord button interactions.

### Referrals
- POST /api/referral validates code against REFERRAL_CODES env var (still works standalone).
- Auth login endpoint also validates referral codes and tracks redemptions.
- Tracking failure never blocks the referral/auth flow.

### Offline indicators
- Amber tint on panel badges when API returns unconfigured/error state.
- Debug mode: append `?debug=1` to /api/giveaway to skip cache and see raw Discord data.

## Commands
- Tests:  npm test   (runs all 6 .mjs tests; pure logic, no network needed)
- Local:  npx wrangler pages dev .    (needs a Cloudflare login; live API calls need real network)
- Deploy: npx wrangler pages deploy .  (or connect the GitHub repo in the Pages dashboard)

## Conventions / DO NOT
- **SAUCY RULE**: Do NOT build, write, or push any new feature or code change until
  the owner says "saucy" TWICE in the same message. Discuss, plan, and propose freely,
  but do not touch code until you see "saucy saucy". This applies per feature request.
  "Saucy saucy" also means merge to main once the changes are committed and tests pass.
  Documentation-only updates (like CLAUDE.md) are exempt.
- **NO EM DASHES.** Never use em dashes in any user-visible text. Non-negotiable.
- NEVER put the Discord bot token in client code. Server-side (Functions + env) only.
- Keep it vanilla -- don't introduce React/Next/bundlers.
- Don't add website-side editing of anything that has a Discord/WOM source.
- Cache external calls (WOM 6h, Discord ~5min, giveaway 1min) -- respect rate limits; send a User-Agent.
- Every fetch has a graceful fallback so a panel never renders empty/broken.
- Fan site: keep the "not affiliated with Jagex" disclaimer in the footer.
- Push directly to main (no feature branches unless requested).
- **Clean up this file** after finishing a task. Keep it current, not a changelog.

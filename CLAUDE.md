# Multi-Misfits — Clan Website (CLAUDE.md)

Read this first. It's the full state of the project so you can continue without re-discovery.

## What this is
A read-only website for the OSRS clan **Multi-Misfits**. Philosophy: the site is a
HUB that DISPLAYS data from tools the clan already uses. Nobody edits the website.
No CMS, no accounts, no forums, no application forms. Recruiting funnels to Discord.

Each content type has exactly ONE source. Never add a second way to edit something.
- News        -> a locked Discord #announcements channel (bot reads it)
- Events       -> Discord Scheduled Events (bot reads them; "Interested" = RSVP)
- Achievements -> Discord "chest" channel (Dink plugin posts drops/pets/CAs)
- Roster/ranks/stats -> Wise Old Man (WOM) group, synced from in-game via RuneLite

## Stack (keep it this way)
- Plain HTML/CSS/JS. NO framework, NO build step. Mobile-friendly, desktop-primary.
- Cloudflare Pages (static) + Pages Functions (serverless) for anything needing a token.
- Dark, heavily OSRS/medieval theme. Fonts: Cinzel (titles) + Jersey 15 (game HUD).
- Owner works mostly on MOBILE — keep single-file previews easy to view.

## Key IDs / constants
- WOM group ID: 26075  (https://wiseoldman.net/groups/26075)
- Discord invite: https://discord.gg/kT4vEGnjgU
- In-game clan: "MultiMisfits" (one word). Owner IGN: mr flsh.
- Dink channel: the "chest" channel (need its numeric channel ID for the achievements fn)

## Files
- index.html                  homepage (hero, news, events, achievements, roster, gallery)
- guides.html / faq.html               content pages (FAQ has real content; Guides is "coming soon")
- roster.html                 full 41-member roster (data-full="1")
- ge.html                     Grand Exchange — full-page iframe embed of 1box.online GE tool
- events.html                 Events page — featured + upcoming + past layout
- style.css                   theme
- app.js                      nav, toasts, Discord links, live roster + news + events + achievements rendering
- functions/api/wom.js        GET /api/wom  -> WOM group, cached 6h, sorted roster
- functions/api/news.js       GET /api/news -> reads #announcements via Discord bot
- functions/api/events.js     GET /api/events -> reads Discord forum threads, parses EventForge dates, cached 5min
- functions/api/achievements.js GET /api/achievements -> reads chest channel (Dink posts), cached 5min; supports ?limit= (max 100) for gallery
- functions/api/spotlight.js  GET /api/spotlight -> reads mod-only spotlight channel, returns latest image
- assets/ranks/*.png          15 rank icons (official, upscaled 2x nearest)
- assets/gallery/shot1-6.webp clan screenshots (static fallback for gallery page)
- test-wom.mjs / test-news.mjs / test-events.mjs / test-achievements.mjs / test-spotlight.mjs   unit tests (83 checks)

## Status
DONE: homepage + all pages, live roster w/ rank icons + sort + pagination + mobile CSS,
      Grand Exchange page (full-page iframe embed of 1box.online), events.html with
      featured/upcoming/past layout, Discord Join wired, gallery, nav/footer on all pages.
BUILT & READY (needs bot token + env vars to go live): news feed, events feed,
      achievements feed. All four serverless functions exist with caching, error handling,
      and graceful fallback. Frontend rendering (loadNews, loadEvents, loadAchievements)
      is wired in app.js — panels show sample data until the API is configured.
BLOCKED on owner: Discord bot creation + env vars, Captain rank icon.

## What's left (priority order)
1. Wire the Discord bot (owner does the Discord side):
   - Bot with Message Content Intent, invited read-only (View Channel + Read Message History)
     to #announcements, chest, and guild scheduled-events scope.
   - Env vars (Pages > Settings > Environment variables, and .dev.vars for local):
       DISCORD_BOT_TOKEN        (secret)
       ANNOUNCEMENTS_CHANNEL_ID (plain)
       CHEST_CHANNEL_ID         (plain)  <- for achievements + gallery screenshots
       SPOTLIGHT_CHANNEL_ID     (plain)  <- for gallery spotlight image (mod-only channel)
       DISCORD_GUILD_ID         (plain)  <- for events
       PUBLISH_REACTION         (optional, e.g. "check" emoji, to gate news)
2. Confirm RANK_ORDER in functions/api/wom.js — Beast/Paladin placement and officer
   order (colonel vs captain) are BEST GUESSES. Owner's ladder: squire < duellist <
   striker < inquisitor < expert < knight < [officers] < [owners].
3. Add Captain rank icon (assets/ranks/captain.png) when provided; add it to
   ICON_ROLES in app.js. (striker/beast/squire are hand-cut, could be swapped for official.)
4. Real content for FAQ (provided, needs rewrite) / Guides (coming soon).
5. Homepage sample text cleanup — replace fake news/events/achievements with
   cleaner "coming soon" placeholders or remove fake dates.
6. Deploy to Cloudflare Pages. Optional custom domain (runs on *.pages.dev first).

## Commands
- Tests:  npm test   (runs all 4 .mjs tests; pure logic, no network needed)
- Local:  npx wrangler pages dev .    (needs a Cloudflare login; live API calls need real network)
- Deploy: npx wrangler pages deploy .  (or connect the GitHub repo in the Pages dashboard)

## Conventions / DO NOT
- **SAUCY RULE**: Do NOT build, write, or push any new feature or code change until
  the owner says "saucy" TWICE in the same message. Discuss, plan, and propose freely,
  but do not touch code until you see "saucy saucy". This applies per feature request.
  "Saucy saucy" also means merge to main once the changes are committed and tests pass.
  Documentation-only updates (like CLAUDE.md) are exempt.
- **NO EM DASHES.** Never use em dashes (—) in any user-visible text. Non-negotiable.
- NEVER put the Discord bot token in client code. Server-side (Functions + env) only.
- Keep it vanilla — don't introduce React/Next/bundlers.
- Don't add website-side editing of anything that has a Discord/WOM source.
- Cache external calls (WOM 6h, Discord ~5min) — respect their rate limits; send a User-Agent.
- Every fetch has a graceful fallback so a panel never renders empty/broken.
- Fan site: keep the "not affiliated with Jagex" disclaimer in the footer.
- Push directly to main (no feature branches unless requested).

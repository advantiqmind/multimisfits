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
- about.html / guides.html / faq.html   content pages (About + FAQ are DRAFT copy)
- roster.html                 full 41-member roster (data-full="1")
- style.css                   theme
- app.js                      nav, toasts, Discord links, live roster + news rendering
- functions/api/wom.js        GET /api/wom  -> WOM group, cached 6h, sorted roster
- functions/api/news.js       GET /api/news -> reads #announcements via Discord bot
- assets/ranks/*.png          15 rank icons (official, upscaled 2x nearest)
- assets/gallery/shot1-6.webp clan screenshots
- test-wom.mjs / test-news.mjs  unit tests for the transform/format logic

## Status
DONE: homepage + pages, live roster w/ rank icons + sort, Discord Join wired, gallery.
BUILT but not connected: news feed (needs bot). 
NOT built yet: events function, achievements (chest) function.
BLOCKED on owner: Discord bot creation, deploy, Captain rank icon.

## What's left (priority order)
1. functions/api/events.js  — read Discord Scheduled Events for the guild, return
   {name, time, description, interestedCount}. Render into the Events panel in app.js
   (replace the sample markup; add loadEvents()).
2. functions/api/achievements.js — read the "chest" channel (Dink posts). Parse Dink's
   embeds/messages into {player, item/achievement, timestamp}. Render into the
   Achievements panel (add loadAchievements()). Reuse the cache pattern from news.js.
3. Wire the Discord bot (owner does the Discord side):
   - Bot with Message Content Intent, invited read-only (View Channel + Read Message History)
     to #announcements, chest, and guild scheduled-events scope.
   - Env vars (Pages > Settings > Environment variables, and .dev.vars for local):
       DISCORD_BOT_TOKEN        (secret)
       ANNOUNCEMENTS_CHANNEL_ID (plain)
       CHEST_CHANNEL_ID         (plain)  <- for achievements
       DISCORD_GUILD_ID         (plain)  <- for events
       PUBLISH_REACTION         (optional, e.g. "check" emoji, to gate news)
4. Confirm RANK_ORDER in functions/api/wom.js — Beast/Paladin placement and officer
   order (colonel vs captain) are BEST GUESSES. Owner's ladder: squire < duellist <
   striker < inquisitor < expert < knight < [officers] < [owners].
5. Add Captain rank icon (assets/ranks/captain.png) when provided; add it to
   ICON_ROLES in app.js. (striker/beast/squire are hand-cut, could be swapped for official.)
6. Real content for About / FAQ / Guides.
7. Deploy to Cloudflare Pages. Optional custom domain (runs on *.pages.dev first).

## Commands
- Tests:  npm test   (runs both .mjs tests; pure logic, no network needed)
- Local:  npx wrangler pages dev .    (needs a Cloudflare login; live API calls need real network)
- Deploy: npx wrangler pages deploy .  (or connect the GitHub repo in the Pages dashboard)

## Conventions / DO NOT
- NEVER put the Discord bot token in client code. Server-side (Functions + env) only.
- Keep it vanilla — don't introduce React/Next/bundlers.
- Don't add website-side editing of anything that has a Discord/WOM source.
- Cache external calls (WOM 6h, Discord ~5min) — respect their rate limits; send a User-Agent.
- Every fetch has a graceful fallback so a panel never renders empty/broken.
- Fan site: keep the "not affiliated with Jagex" disclaimer in the footer.

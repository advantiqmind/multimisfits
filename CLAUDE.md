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
- roster.html                  leaderboard page (full clan roster from WOM, data-full="1")
- ge.html                      Grand Exchange -- full-page iframe embed of 1box.online GE tool
- events.html                  Events + Giveaways tabs (hash-based: #giveaways persists on refresh)
- gate.html                    auth gate landing page (referral code + Discord OAuth)
- wheel.html / wheel.js        Loot Wheel page (spin for a winner; loads event participants)
- wheel-popout.html            popout wheel window (canvas + spin only, synced via BroadcastChannel)
- strats.html / strats.js      Strat Finder (OSRS Wiki strategy guide launcher, categorized boss tiles)
- bracket.html / bracket.js    Bracket Knockout (code-locked giveaway drawing tool, dice-based HP combat)
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
- functions/api/spotlight.js   GET /api/spotlight -> reads mod-only spotlight channel, returns latest image only (message text never shown; just image + posted-by)
- functions/api/giveaway.js    GET /api/giveaway -> reads giveaway forum channel, cached 1min; supports ?debug=1
- functions/api/loot.js        POST /api/loot -> receives Dink loot webhooks, stores in D1, forwards big drops to Discord; GET returns leaderboard
- functions/api/referral.js    POST /api/referral -> validates referral codes, tracks redemptions in Discord forum thread
- functions/api/discord.js    Discord interactions endpoint (slash commands); GET = register commands
- assets/ranks/*.png           rank icons (official, upscaled 2x nearest)
- assets/gallery/shot1-6.webp  clan screenshots (static fallback for gallery page)
- test-*.mjs                   unit tests (7 files: wom, news, events, achievements, spotlight, giveaway, loot)

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
    LOOT_WEBHOOK_KEY         (secret) <- auth key for Dink loot webhooks (?key=VALUE)
    LOOT_DISCORD_WEBHOOK     (secret, optional) <- Discord webhook URL for chest channel (forwarding proxy)
    LOOT_DISCORD_MIN_VALUE   (plain, optional)  <- min total value to forward to Discord (default 150000)

## Bindings (Cloudflare Pages > Settings > Functions)
    DB  ->  D1 database "multimisfits-auth"  (sessions + loot_entries tables)

## Status
LIVE: Site deployed on Cloudflare Pages. Discord bot wired up. All pages, roster,
      events, giveaways, achievements, news, gallery, FAQ -- everything functional.

## What's left
Nothing pending.

## Future ideas (not built yet)

### Battle Royale Drawing
A top-down arena (Wilderness/PvP themed) where player names spawn as dots or shields.
Random events eliminate names: shrinking danger zone, lightning strikes, sword clashes.
Final 5 get health bars, final 2 get a 1v1 duel animation, winner gets a crown.
Runtime 1-2 minutes. Most complex drawing option -- canvas animation, collision logic,
zone shrinking. Would live alongside the bracket/slot machine drawing tools.
Planned for later, after the slot machine is done.

## How things work

### Giveaways
- Separate Discord forum channel (GIVEAWAY_CHANNEL_ID) from events.
- Each round = one forum thread. Leaders react with 1/2 keycap emoji on member
  screenshots to confirm entries (max 2 per person).
- /giveaway-entry slash command: leaders add or subtract entries (-5 to +5).
  Posts "Entry Added" or "Entry Removed" embed. Restricted to leader role via
  Discord Integrations. Accumulation mode: all bot embeds for a player are summed,
  final total clamped to [0, MAX_ENTRIES_PER_PERSON].
- /giveaway-check slash command: look up a player's entry count in the current
  giveaway. Open to all members (no Discord Integrations override needed).
- Bot embeds parsed by extractBotEntry(): Player + Entries fields, accumulation
  with sum-then-clamp. "Entry Removed" returns negative count for subtraction.
- Reaction entries and manual bot entries merge per person by lowercase player
  name (Discord display name vs Player field), one row each, combined total
  clamped to [0, MAX_ENTRIES_PER_PERSON]. Leaders must type the name as shown
  on Discord (case does not matter) for the merge to apply.
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
- Forum tags (Bond, Item, Kit, Random, Goodie Bag, GP) set in Discord for categorization.

### Loot Value Leaderboard
- Events tagged `[Loot Value]` in the thread name track cumulative boss loot per player.
- Data source: Dink RuneLite plugin sends loot webhooks to POST /api/loot?key=SECRET.
- Each Dink payload has playerName, source (boss name), killCount, items with prices.
- `Boss:` line in event description sets the boss filter (case-insensitive exact match).
  - Single boss: `Boss: Chambers of Xeric`
  - Multiple: `Boss: Chambers of Xeric, Theatre of Blood`
  - All bosses: `Boss: any` or omit the line entirely.
- Loot Value events identified by the "Loot Value" Discord forum tag (not thread name).
  Backend fetches channel available_tags to resolve tag IDs. Frontend receives tag names
  in the event's `tags` array from /api/events.
- Endpoint checks active events with the "Loot Value" tag (cached 5min), matches boss, stores in D1.
- D1 table `loot_entries` auto-created on first use (id, event_id, player, source, kill_count,
  items JSON, total_value, created_at).
- GET /api/loot?event=THREAD_ID returns leaderboard (top 20), stats, notable drops (top 5 items).
- Frontend renders leaderboard on featured event + event modal for Loot Value tagged events.
- Event cards show "LOOT" tag. Featured + modal show "LOOT VALUE" tag.
- Leaderboard shows medals for top 3, KC per player, total loot value.
- Notable drops section shows highest individual item values.
- "Live via Dink" badge at bottom of leaderboard.
- Forwarding proxy: site receives ALL drops (Dink min value = 1), stores for events,
  and forwards drops >= LOOT_DISCORD_MIN_VALUE (default 150k) to Discord chest channel.
  Members only need one URL in Dink: https://multimisfits.us/api/loot?key=SECRET
  Set LOOT_DISCORD_WEBHOOK to the chest channel's Discord webhook URL.
  Forwarding is fire-and-forget via context.waitUntil (does not block the response).
- Auth key stored in LOOT_WEBHOOK_KEY env var. /api/loot bypasses auth middleware.
- Leaderboard cached 1min at Cloudflare edge. Active events mapping cached 5min.

### Events
- Forum threads from events channel, excluding giveaway-named threads.
- EventForge date parsing: `When:` and `Ends:`/`End:` lines (plain text or Discord timestamps).
- [LIVE] tag in thread name forces live status regardless of dates.
- Emoji-prefixed date lines supported (e.g. calendar emoji before When:).
- Discord forum tags (e.g. Entry, PVM, Loot Value) resolved from channel available_tags
  and included in each event's `tags` array.

### Event Teams
- Teams are OPTIONAL. Events without team data look exactly the same as before.
- Leaders assign members to teams (A/B/C/D) via regional indicator emoji reactions
  on member messages in event threads, or via slash commands.
- Team emoji: A = U+1F170, B = U+1F171, C = U+1F1E8, D = U+1F1E9.
- Team colors: A=#e04040 (red), B=#4a90d9 (blue), C=#4ad04a (green), D=#e8a832 (amber).
- Bot embeds ("Team Assigned"/"Team Removed" with Player + Team fields) override reactions.
- Processed chronologically by snowflake ID; later assignments override earlier ones.
- A player can only be on one team; Team Removed clears their assignment.
- API response `teams` field: null when no teams, or `{ a: ["Name1"], b: ["Name2"], ... }`.
- Slash commands: /team-assign (player + team A/B/C/D), /team-remove (player),
  /team-check (player lookup), /team-list (all teams). Restricted to leaders via
  Discord Integrations (except team-check and team-list which are open).
- Website display: colored team dots on event cards, "TEAMS" badge + team roster
  in featured events and modals. All theme-aware (default, wilderness, PVM, social).

### Event Participants
- Participation is OPTIONAL. Events without participant data look exactly the same as before.
- Members react with green checkmark (U+2705) on the opening message of event threads.
- Backend fetches actual reactors via Discord reactions endpoint
  (`/channels/{id}/messages/{id}/reactions/✅?limit=100`), not message-level reaction metadata.
  Bot users (u.bot) are filtered out.
- Leaders can manually add/remove participants via slash commands.
- Bot embeds ("Participant Added"/"Participant Removed" with Player field) override reactions.
  Processed chronologically by snowflake ID; later actions override earlier ones.
- Reactors and bot embeds merge: reactors added first, then embeds applied in order.
  A player appears once; Participant Removed clears their entry.
- API response `participants` field: null when no participants, or sorted array of player names.
- `transformThreads` accepts 5th param `threadReactors` (Map of threadId -> reactor user array).
- Slash commands: /participant-add (player string), /participant-remove (player string),
  /participant-list (shows all participants). Add/remove restricted to leaders via
  Discord Integrations; /participant-list open to all.
- Bot embed colors: Participant Added = 0x2ecc71 (green), Participant Removed = 0xe74c3c (red).
- Website display: participant count on event cards ("X joined"), themed participant button
  in CTA row next to RSVP. Clicking opens a popup modal (z-index 90) with participant chips.
  Modal themed per event type (default green, ev-wild red, ev-social green, ev-pvm purple).

### Loot Wheel
- wheel.html: client-side prize wheel ported from the 1BOX wheel (1box.online copy untouched).
- Protected by the normal auth gate like every other page; members only, no extra config.
- Entries stored in localStorage (key mm-wheel-v1) as {name, count}; manual add, +/- counts,
  remove, clear all. Prize text shown in the winner modal. Winner can be removed and respun.
- Participant auto-load: fetches /api/events (same origin, session cookie), events with a
  non-empty participants array appear in the Event dropdown; Load fills entries (1 slot each,
  confirm before replacing existing entries).
- Deep link: /wheel.html?event=THREAD_ID auto-loads that event's participants on arrival.
  The participant modal on events pages has a "Spin the Wheel" button linking there.
- Popout (wheel-popout.html) mirrors the wheel for streaming; synced via BroadcastChannel
  "mm-loot-wheel" + storage events. No nav link by owner request: reached via the
  "Spin the Wheel" button in event participant modals, or the direct URL.
- All wheel CSS is namespaced .wheel-* in style.css; graceful fallback if /api/events fails
  (dropdown shows "Events unavailable", manual entry still works).

### Strat Finder
- strats.html: clan-themed rework of the 1BOX Strat Finder (1box.online copy untouched).
- Protected by the normal auth gate; purely client-side, no backend or env vars.
- ~56 targets in strats.js TARGETS, grouped by category (Raids, Wilderness, Slayer,
  God Wars, DT2, Bosses, Minigames, Skilling) with colored section headers, tiles,
  and filter chips reusing the event theme hues.
- Tiles link to {page}/Strategies on the OSRS Wiki (new tab). `p` field overrides the
  wiki page name when it differs from the display name (e.g. Fight Caves -> TzHaar Fight Cave).
- NPC art hotlinked from the wiki via Special:FilePath?width=80; `img` field overrides
  the filename. On image error the tile keeps its Cinzel initials medallion, so a wrong
  filename never breaks the layout. Fix art misses by setting `img` on that entry.
- Search filters tiles live; GO/Enter resolves clan shorthand from the ALIASES map
  (cox, tob, gg, thermy...), falls back to wiki search for unknown text.
- Recent row (localStorage mm-strats-recent, last 4 clicked) pinned above the sections.
- All CSS namespaced .st-* in style.css. Nav link "Strats" on all pages.
- Event tie-in idea (highlight tonight's boss from live Loot Value events) discussed but
  intentionally NOT built yet.

### Bracket Knockout
- bracket.html / bracket.js: code-locked giveaway drawing tool. OSRS-themed elimination
  bracket where participants fight via dice-based HP combat.
- Protected by the normal auth gate + a secondary code lock (passphrase "Misfits",
  capital M, stored in localStorage key "mm-bracket-unlocked"). Hidden in plain sight:
  no nav link, reached only by direct URL /bracket.html.
- Data sources: /api/events (participants), /api/giveaway (entries), /api/wom (clan ranks).
  Events dropdown shows events with participants; giveaways show rounds with entries.
- Deep link: /bracket.html?event=THREAD_ID or ?giveaway=ROUND_INDEX auto-loads on arrival.
- HP system: 1 entry = 15 HP (base only), 2 entries = 20 HP (15 base + 5 shield),
  3+ entries = 21-23 HP (15 base + 5 shield + 1-3 bonus). HP displayed as colored
  chunks (red base, blue shield, green bonus).
- Combat: all players attack with d7 (0-6 damage). Trade hits alternately until one
  reaches 0 HP. Canvas-drawn OSRS-style hit splats (regular red, max-hit red, zero blue).
- Two-level control: "Start Round" shows fight overlay with matchup preview,
  "Start Fight" begins the animation. Speed slider (1-5x) adjusts animation speed.
- Bracket auto-pads to next power of 2 with byes (auto-resolved). Players shuffled
  randomly on load. Seeds displayed. Round names: Round of N, Quarter Finals, Semi Finals, Final.
- Rank icons from WOM data shown next to player names (uses rankMark() from app.js).
- Stream Popout window for Discord screen-sharing via window.open() + window.opener.receive().
  Self-contained HTML/CSS/JS written via document.write(). No BroadcastChannel.
- Champion celebration: sparkle effects, trophy emoji, gold styling.
- All CSS namespaced .bk-* in style.css. Mobile responsive (stacked layout on small screens,
  bracket scrolls horizontally). Reduced motion support.

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
- Tests:  npm test   (runs all 7 .mjs tests; pure logic, no network needed)
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

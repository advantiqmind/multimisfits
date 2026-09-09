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
- Idea Board  -> Discord thread (leaders post ideas as messages; kanban on site via D1)
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
- wheel.html / wheel.js        Loot Wheel page (spin for a winner; loads event participants)
- wheel-popout.html            popout wheel window (canvas + spin only, synced via BroadcastChannel)
- strats.html / strats.js      Strat Finder (OSRS Wiki strategy guide launcher, categorized boss tiles)
- bracket.html / bracket.js    Bracket Knockout (code-locked giveaway drawing tool, dice-based HP combat)
- armoury.html                 The Armoury landing page (leader tools hub, self-contained styles)
- eventforge.html              EventForge (Discord event post designer, shared saves via D1, self-contained styles)
- ideaboard.html               Idea Board (kanban for event ideas, Discord-sourced, self-contained styles)
- filecabinet.html             File Cabinet (leader-only document archive, self-contained styles, D1 storage)
- clandink.html                Clan Dink Settings page (copy button for Dink plugin import)
- dink-config.txt              Dink plugin settings JSON (edit this file to update what members copy)
- style.css                    theme
- app.js                       nav, toasts, Discord links, all panel rendering
- functions/_middleware.js     pass-through middleware (no auth gate)
- functions/api/wom.js         GET /api/wom  -> WOM group, cached 6h, sorted roster
- functions/api/news.js        GET /api/news -> reads #announcements via Discord bot
- functions/api/events.js      GET /api/events -> reads forum threads (filters out giveaway threads), cached 5min
- functions/api/achievements.js GET /api/achievements -> reads chest channel (Dink posts), cached 5min
- functions/api/spotlight.js   GET /api/spotlight -> reads mod-only spotlight channel, returns latest image only (message text never shown; just image + posted-by)
- functions/api/giveaway.js    GET /api/giveaway -> reads giveaway forum channel, cached 1min; supports ?debug=1
- functions/api/eventforge.js  GET/POST/PUT/DELETE /api/eventforge -> shared EventForge saves CRUD, D1 storage, optimistic locking, cached 30s; writes require EVENTFORGE_ACCESS_CODE
- functions/api/ideaboard.js   GET/POST /api/ideaboard -> reads Discord thread ideas, D1 column positions + dismiss tracking, two-tier access codes, cached 30s
- functions/api/announce-dink.js POST /api/announce-dink -> sends Dink update embed to #announcements, gated by DINK_ACCESS_CODE
- functions/api/dink-auth.js   POST /api/dink-auth -> validates access code against DINK_ACCESS_CODE env var
- functions/api/loot.js        POST /api/loot -> receives Dink loot webhooks, stores in D1, forwards big drops to Discord; GET returns leaderboard
- functions/api/filecabinet.js  GET/POST /api/filecabinet -> File Cabinet CRUD, D1 storage (5 tables), access code gated
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
    IDEABOARD_THREAD_ID      (plain)  <- Discord thread for idea board (1481866333116436577)
    PUBLISH_REACTION         (optional, e.g. "avatar" emoji) gates human news + bot publish
    REFERRAL_CODES           (plain)  <- comma-separated codes, e.g. "TEQUILA,FLASH,KOI"
    DISCORD_INVITE           (plain, optional) <- override invite URL; defaults to hardcoded link
    REFERRAL_THREAD_ID       (plain, optional) <- forum thread ID for referral tracking
    DISCORD_PUBLIC_KEY       (plain) <- from Discord Developer Portal, for slash commands
    LOOT_WEBHOOK_KEY         (secret) <- auth key for Dink loot webhooks (?key=VALUE)
    LOOT_DISCORD_WEBHOOK     (secret, optional) <- Discord webhook URL for chest channel (forwarding proxy)
    LOOT_DISCORD_MIN_VALUE   (plain, optional)  <- min total value to forward to Discord (default 150000)
    EVENTFORGE_ACCESS_CODE   (secret) <- passphrase for EventForge shared saves (write operations)
    IDEABOARD_LEADER_CODE    (secret) <- full access to Idea Board (move, dismiss, comment)
    IDEABOARD_MEMBER_CODE    (secret) <- comment-only access to Idea Board
    DINK_ACCESS_CODE         (secret) <- passphrase to unlock /clandink settings page
    FILECABINET_ACCESS_CODE  (secret) <- passphrase for File Cabinet (leader-only, no read fallback)

## Bindings (Cloudflare Pages > Settings > Functions)
    DB  ->  D1 database "multimisfits-auth"  (loot_entries, idea_positions, idea_notes, eventforge_saves, fc_folders, fc_files, fc_versions, fc_comments, fc_activity tables)

## Status
LIVE: Site deployed on Cloudflare Pages. Discord bot wired up. All pages, roster,
      events, giveaways, achievements, news, gallery, FAQ -- everything functional.

## What's left
- Waiting on Dink plugin fix for ToA chest loot (PR pajlads/DinkPlugin#1014): division
  by zero in getAmascutPurpleProbability() crashes GSON serialization, preventing raid
  chest notifications from sending. Room kills (Akkha, Ba-Ba) work fine. No action on
  our side until the Dink fix is merged and released.

## Future ideas (not built yet)

### Armoury Version Display
Each tool card on armoury.html shows a version number (e.g. "v1.0"). Version numbers
are also displayed on each tool's own page (footer or header). Single source of truth:
when a tool is updated, ALL places that reference its version must update at once.
If Idea Board gets a new feature and bumps to v1.3, armoury.html AND ideaboard.html
both show v1.3 in the same commit. No version drift between pages.
Current tools to track: Loot Wheel, Bracket, Idea Board, EventForge, File Cabinet.

### Battle Royale Drawing
A top-down arena (Wilderness/PvP themed) where player names spawn as dots or shields.
Random events eliminate names: shrinking danger zone, lightning strikes, sword clashes.
Final 5 get health bars, final 2 get a 1v1 duel animation, winner gets a crown.
Runtime 1-2 minutes. Most complex drawing option -- canvas animation, collision logic,
zone shrinking. Would live alongside the bracket/slot machine drawing tools.
Planned for later, after the slot machine is done.


### Giveaway Donation Leaderboard
Add optional `gp` parameter to /giveaway-entry slash command (defaults to gpPerEntry rate,
leaders can override for bonus donations). Bot embed stores GP amount per entry. Backend
sums GP per player. Frontend shows "Top Donors" ranking on giveaway cards. Similar pattern
to the Loot Value leaderboard but for GP contributions.

### WOM Event Scoring System
General-purpose scoring tool that pulls Wise Old Man API data (skills, bosses, clues,
activities) for event date ranges and applies custom scoring weights to build leaderboards.
Replaces the current Loot Value system with something far more flexible.

**How it works:**
- WOM tracks per-metric gains (XP, KC, scores) over any date range via their delta endpoint.
- EventForge gets a "Scoring" config section where leaders pick which metrics to score
  and assign point weights per tier (e.g. 1 KC at Chambers of Xeric = 5 pts, 1M Slayer XP = 3 pts).
- Preset templates for common event types: bingo, skilling comp, boss KC race, total level race.
- Backend pulls WOM deltas for event participants between event start/end dates,
  applies the scoring weights, returns a ranked leaderboard.
- Two display locations:
  1. Event cards/modals: "View Standings" button shows live leaderboard during the event.
  2. Leaderboard page (currently "coming soon"): becomes a hall of fame with past event
     winners, historical standings, and a trophy case.
- Supports team events (team score = sum of member scores) using existing team assignment system.
- No new data entry needed from members. Everything derived from WOM tracking + RuneLite sync.
- Key WOM endpoints: group deltas (gains per member over date range), player gains.
- Scoring configs stored alongside event data in EventForge (D1).

## How things work

### Discord name resolution
- Events and giveaway endpoints fetch the guild members list to get server nicknames.
- Name priority: server nickname (member.nick) > global display name (user.global_name) > username.
- Guild members fetched once per request via `GET /guilds/{guild_id}/members?limit=1000`.
- Graceful fallback: if the guild members fetch fails, names fall back to global_name/username.
- Members typically set their server nickname to match their RSN (RuneScape name). Leaders
  can also set it via right-click > Change Nickname. This is how bracket/wheel tools match
  Discord participants to WOM rank data.
- The `fetchNickMap()` and `resolveName()` helpers live in both events.js and giveaway.js.

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

### Idea Board
- Discord thread (IDEABOARD_THREAD_ID) is the single source of truth for ideas.
- Leaders post ideas as messages in the thread. First line = title, remaining lines = notes.
- Hashtags in messages become colored tag chips. Eleven known tags:
  #website (amber), #discord (indigo), #pvm (purple), #pvp (orange-red),
  #wild (red), #social (orange), #skilling (blue), #weekend (green),
  #1day (blue), #teams (purple), #misc (grey). Unknown tags get default grey.
- Main tags (#weekend, #1day, #discord, #website) color the entire card with
  a tinted background and left accent border for quick visual identification.
  Other tags are sub-category chips that appear on the card but don't color it.
  Cards in the On Hold column always show red regardless of tag.
  Cards in the Used column show green with green glow.
- Color key bar at top shows "Color Coded:" with visual swatches for each main tag.
  Collapsible hashtag guide shows sub-category tags with descriptions.
- "Events" meta-filter shows cards tagged with either #1day or #weekend.
  Filter order: All | Events | 1 Day | Weekend | Website | Discord | PvM | PvP | Wild | Social | Skilling | Teams | Misc.
- Discord channel mentions: when a hashtag like #pvm matches a Discord channel
  name, Discord auto-links it to `<#CHANNEL_ID>`. Backend fetches guild channels
  (fetchChannelMap), resolves channel IDs to names, and adds matching known tags.
- Tag regex `/#((?=\w*[a-zA-Z])\w+)/g` allows digit-starting tags like #1day
  while excluding pure-numeric Discord IDs.
- Author resolved via nick map (same fetchNickMap/resolveName pattern as events/giveaways).
  Backend also passes authorId and authorAvatar from Discord message data.
- In Review cards show a prominent author identity block: circular Discord avatar
  (from CDN via authorId/authorAvatar) with large Cinzel name. Falls back to styled
  initial letter if avatar unavailable. Other columns show normal "by Name" line.
- Media attachments: image attachments from Discord messages are passed as an `images` array.
  Cards with images show a collapsible "Media (N)" toggle that expands to show the images inline.
- Backend: GET /api/ideaboard fetches all thread messages, parses ideas, joins with D1
  `idea_positions` table for column placement and dismiss state, and `idea_notes` for
  comments. Cached 30s.
- POST /api/ideaboard: actions "move" (column, requires leader code), "dismiss" (leader),
  "restore" (leader), "add_note" (leader or member code), "validate" (check code validity).
  All write actions require access_code in request body.
- Two-tier access control: IDEABOARD_LEADER_CODE = full access (move, dismiss, restore, comment).
  IDEABOARD_MEMBER_CODE = comment only. No code = read-only view. If neither env var set,
  everyone gets leader access (backwards compatible). Frontend stores code in localStorage
  (mm-ideaboard-code), auto-validates on page load, shows access badge (Leader/Member/View Only).
- D1 table `idea_positions`: message_id (PK), column_name, dismissed, dismissed_by, moved_by, updated_at.
- D1 table `idea_notes`: id (autoincrement), message_id, author, text, created_at.
- Frontend: kanban board with 5 columns (In Review, Approved, Created and Shared, On Hold, Used).
  Drag-and-drop moves cards between columns (leader only, optimistic UI, reverts on API error).
- Valid columns: review, approved, shared, onhold, used.
- Old column names (planned, active, done, ideas, rejected) auto-migrate to new keys on read.
- On Hold column: ideas that weren't approved but aren't dismissed. Moving a card to On Hold
  requires a comment explaining why (overlay prompt, comment posted before the move).
  Cards show red styling. Awaiting discussion about improvements.
- Day counter: cards in In Review and On Hold show "X days" badge based on creation date.
  After 7 days, the badge pulses to flag stale ideas that need attention.
- Copy button appears ONLY on cards in the Approved column. Copies title + notes for
  pasting into EventForge AI Assist.
- Cards show title, author, date, tags, "Moved by" attribution. Click to expand notes.
  Collapsible comments section per card with add-comment form (leader/member only).
- Name required for all actions (move, dismiss, add comment). Prompted on first use,
  stored in localStorage (mm-ideaboard-user). Change name via header link.
- Collapsible columns: tap/click a column header to collapse/expand its cards.
  Chevron rotates to indicate state. Persisted in localStorage (mm-ideaboard-collapsed).
  Survives auto-refresh since render() only replaces card content, not column elements.
- Auto-refresh: board polls every 30s, shows "Board updated" toast on changes.
  Pauses when tab is hidden or during drag. Fingerprint-based diff detection.
- Dismiss records who dismissed it. Dismissed cards viewable via toggle, restorable.
- "Post in Discord" button links to the Discord thread for new ideas.
- Self-contained page (no style.css/app.js imports). Part of The Armoury leader tools.
- Channel link: https://discord.com/channels/1454526817141784759/1464731160968953898

### Loot Value Leaderboard
- Events tagged `[Loot Value]` in the thread name track cumulative boss loot per player.
- Data source: Dink RuneLite plugin sends loot webhooks to POST /api/loot?key=SECRET.
- Each Dink payload has playerName, source (boss name), killCount, items with prices.
- `Boss:` line in event description sets the boss filter (case-insensitive startsWith match).
  Difficulty variants match the base name (e.g. "Tombs of Amascut: Expert Mode" matches
  filter "Tombs of Amascut").
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
- Winner detected via trophy emoji (U+1F3C6) in thread messages, same logic as giveaways:
  @mention > text after trophy (greeting words stripped, max 3 words) > message author.
  Auto-capitalized. API response `winner` field: null when no trophy, or the winner's name.
  Shown on completed event cards (gold text) and in featured/modal views (spotlight banner).
  Silent until activated: no trophy emoji = no winner display.

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

### EventForge
- eventforge.html: Discord event post designer ported from 1box.online. Self-contained (inline CSS/JS).
- Armoury-only tool (not on main site nav). Part of The Armoury leader tools.
- Features: block-based event builder, Discord markdown generation, live preview with inline
  editing, timezone-smart timestamps, recurrence system, template system, export/import,
  text formatting toolbar, event results/winners, keyboard shortcuts, mobile-responsive.
- Timestamp tool: "Timestamp" button in nav opens a Discord timestamp generator overlay.
  Pick date, time, and timezone; see all 7 Discord format codes with live previews and
  copy buttons. Reuses existing zonedUnix() and timezone options. Click outside to close.
- Time presets: single day defaults to 20:00-23:30, multi-day defaults to Friday 16:00
  to Sunday 22:00. Quick date buttons also fill end time if empty.
- Shared saves: events and templates stored in D1 (eventforge_saves table) via /api/eventforge.
  Visible to all clan leaders. Required category (PvM/Skilling/Minigame/Social/Competition/Other)
  and name when saving to shared. Optimistic locking with version numbers for conflict resolution.
- Access control: POST/PUT/DELETE require EVENTFORGE_ACCESS_CODE env var. Frontend prompts
  for the code once (stored in localStorage as mm-eventforge-access), clears on wrong code.
  GET (list/read) remains open.
- User identity via localStorage (mm-eventforge-user), prompted on first shared save.
- Local saves: events and templates in localStorage (mm_eventforge_v2), unaffected by shared saves.
- D1 table: eventforge_saves (id, type, name, category, data, created_by, updated_by, version,
  created_at, updated_at). Auto-created on first use.
- Post types: announcement, reminder, results, compact. Output styles: standard, minimal.
- RSVP line enabled by default on all new events (rsvp: true in freshEvent).
- AI Assist: "AI Assist" button in nav opens overlay. User optionally describes event idea,
  clicks "Copy Prompt" to copy full AI prompt to clipboard (works with or without an idea),
  pastes into any AI, copies the JSON result, pastes back and clicks Import.
  Prompt rules: no em dashes allowed, only crossed swords and green checkmark emoji in text,
  medal emoji only in prize lines, every event ends with "React with checkmark if you plan
  to make it!" as a custom block. Emphasizes JSON-only output (no code fences, no explanation).
  Import handles wrapped template format, bare events, strips markdown code fences, assigns
  fresh UIDs.

### Loot Wheel
- wheel.html: client-side prize wheel ported from the 1BOX wheel (1box.online copy untouched).
- No auth required (site is public). Purely client-side, no backend or env vars.
- Entries stored in localStorage (key mm-wheel-v1) as {name, count}; manual add, +/- counts,
  remove, clear all. Prize text shown in the winner modal. Winner can be removed and respun.
- Participant auto-load: fetches /api/events (same origin, session cookie), events with a
  non-empty participants array appear in the Event dropdown; Load fills entries (1 slot each,
  confirm before replacing existing entries).
- Deep link: /wheel.html?event=THREAD_ID auto-loads that event's participants on arrival.
- Popout (wheel-popout.html) mirrors the wheel for streaming; synced via BroadcastChannel
  "mm-loot-wheel" + storage events. No nav link by owner request: reached via the
  "Spin the Wheel" button in event participant modals, or the direct URL.
- All wheel CSS is namespaced .wheel-* in style.css; graceful fallback if /api/events fails
  (dropdown shows "Events unavailable", manual entry still works).

### Strat Finder
- strats.html: clan-themed rework of the 1BOX Strat Finder (1box.online copy untouched).
- Purely client-side, no backend or env vars.
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
- Secondary code lock (passphrase "Misfits",
  capital M, stored in localStorage key "mm-bracket-unlocked"). Hidden in plain sight:
  no nav link, reached only by direct URL /bracket.html.
- Data sources: /api/events (participants), /api/giveaway (entries), /api/wom (clan ranks).
  Events dropdown shows events with participants; giveaways show rounds with entries.
  Load button replaces auto-load on picker change.
- Manual entry: name input + entry count (1-5), +/- adjust, remove, clear all. HP preview
  next to each entry. Case-insensitive dedup (adding existing name adds to their entries).
  Matches the Loot Wheel entry panel UX. Manual and loaded entries can coexist.
- Deep link: /bracket.html?event=THREAD_ID or ?giveaway=ROUND_INDEX auto-loads on arrival.
- HP system: 1 entry = 15 HP (base only), 2 entries = 20 HP (15 base + 5 shield),
  3-5 entries = 21-23 HP (15 base + 5 shield + 1-3 bonus),
  6 entries = 24 HP (+1 special purple). HP displayed as a smooth rounded bar
  with colored sections (red base, blue shield, green bonus, purple special),
  tick marks at section boundaries, and centered HP number.
- Combat: all players attack with d7 (0-6 damage). Trade hits alternately until one
  reaches 0 HP. PNG hitsplat assets (regular red, max-hit red, zero blue).
  Previous splats dim before the next hit lands to signify whose turn it is.
- Two-level control: "Start Round" shows fight overlay with matchup preview,
  "Start Fight" begins the animation. Speed slider (1-5x) adjusts animation speed.
  Closing the overlay mid-fight pauses; the main Start button shows "Resume" to reopen.
- Dynamic bracket: rounds pair up all players; if the count is odd, exactly 1 player
  gets a bye (rendered as a single card, no "BYE" label). No power-of-2 padding.
  Players shuffled randomly on load. Seeds displayed. Round names: Round of N,
  Quarter Finals, Semi Finals, Final.
- Rank icons from WOM data shown next to player names (uses rankMark() from app.js).
- Fight overlay never auto-closes after a round's last fight. Non-final rounds show a
  "Close" button; Final shows "Crown the Champion" (replaces the X).
- Champion celebration: clicking "Crown the Champion" shows a sealed scroll overlay
  with the MM shield, event name (from picker), MM trophy, and champion name in gold.
  Closing triggers sparkle effects on the main bracket and reveals the champion card.
- Assets: bracket-trophy-mm.png (MM-branded trophy), bracket-shield-mm.png (MM shield).
- All CSS namespaced .bk-* in style.css. Mobile responsive (stacked layout on small screens,
  bracket scrolls horizontally). Reduced motion support.

### File Cabinet
- filecabinet.html: standalone document archive for clan leaders. Self-contained (inline CSS/JS).
- Armoury-only tool (featured full-width card at top). Part of The Armoury leader tools.
- NOT connected to Discord. Leaders upload and manage files directly on the website.
- Single-tier access: entire tool locked behind FILECABINET_ACCESS_CODE. No read-only fallback.
  Code prompted on first visit, stored in localStorage (mm-filecabinet-code).
- 9 default folders seeded on first access: Clan Rules, Guides, Event Templates, Event Results,
  Rank System, Announcements Archive, Clan Assets, Recruitment, Finances / Clan Coffers.
- Custom folder creation with emoji icons, colors, and descriptions.
- Files: title, content (text), tags, "filed by" attribution, pinning, starring (localStorage).
- Full-text search across title, content, and tags. Scoped to current folder or all folders.
- Discussion/comments per file: timestamped notes attached to any entry. Same pattern as Idea Board.
- Version history: editing saves old version. View previous versions in modal.
- Import: JSON bulk-load. Export: download file content.
- Move files between folders, duplicate files, deep links (#file=ID).
- Sort: newest, oldest, alphabetical, recently edited. Per-folder toggle.
- Trash: 15-day retention, restore or empty. Auto-cleanup on each GET request.
- Activity log: audit trail of all write operations.
- D1 tables: fc_folders, fc_files, fc_versions, fc_comments, fc_activity (auto-created on first use).
- Backend: functions/api/filecabinet.js. All POST operations require access code. GET cached.
- User identity stored in localStorage (mm-filecabinet-user), prompted on first action.
- Star/bookmark in localStorage (mm-filecabinet-stars).
- Later: R2 for image uploads, Idea Board archive integration, EventForge archive integration.

### Discord invite lock
- Site is fully public (no auth gate). Middleware passes all requests through.
- All Discord join links (data-discord elements) are locked behind a referral code modal.
- Discord invite URL is NOT in client-side code. Server returns it only after code validation.
- POST /api/referral validates code against REFERRAL_CODES env var, returns invite URL on success.
- Tracking: valid redemptions post an embed to a Discord forum thread (REFERRAL_THREAD_ID).

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

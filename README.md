# Multi-Misfits clan site — v0.3.0

Static multi-page site + serverless functions. Plain HTML/CSS/JS, no build step.

## Pages
- index.html — homepage (hero, news, events, achievements, live roster, gallery)
- about.html, guides.html, faq.html — content pages (About/FAQ have DRAFT copy — send real wording)
- roster.html — full 41-member roster, live from WOM

## Shared
- style.css — theme
- app.js — nav, toasts, Discord links, live roster + news rendering
- functions/api/wom.js — /api/wom: WOM group 26075, cached 6h, sorted roster
- functions/api/news.js — /api/news: reads locked #announcements via Discord bot (needs env)
- assets/ranks/*.png — 8 rank icons (paladin, knight, expert, inquisitor, striker, duellist, beast, squire)
- assets/gallery/shot1-6.webp — clan screenshots

## Deploy (Cloudflare Pages)
1. Push folder to GitHub (or drag-drop in Pages dashboard).
2. Pages > Create > connect repo. Framework preset = None, Build command = blank, Output dir = /.
3. Deploy > https://<project>.pages.dev . Functions deploy automatically.

## Config / env vars (Cloudflare Pages > Settings > Environment variables)
- app.js > CONFIG.discordInvite = https://discord.gg/kT4vEGnjgU  (already set)
- News (Phase B): DISCORD_BOT_TOKEN (secret), ANNOUNCEMENTS_CHANNEL_ID (plain), optional PUBLISH_REACTION
- functions/api/wom.js > RANK_ORDER — confirm Beast/Paladin placement + officer order

## Status
- LIVE (from WOM): roster + ranks, sorted, with rank icons for member ranks.
- LIVE (assets): gallery (6 screenshots), Discord Join buttons.
- SAMPLE until Discord bot is set up: news, events, achievements (Dink/chest).
- Rank icons present for 8 member ranks; owner/deputy_owner/colonel/captain still use a chevron (need icons).

## Tested
- test-wom.mjs, test-news.mjs — transform/sort/format logic. All pass.
- JS syntax + HTML id/hook consistency.
- NOT live-tested: WOM/Discord HTTP calls (sandbox cannot reach them) — verify on deploy.

## Next (Phase B — Discord)
- Create locked #announcements (only ranks can post).
- Create a Discord bot, enable Message Content Intent, invite it (View Channel + Read Message History) to #announcements and chest.
- Set token as a Pages secret. Then news + achievements go live.

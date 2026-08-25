/* Multi-Misfits — front-end behaviour
   - wires the Join / Discord links from one place (CONFIG)
   - mobile nav + "coming soon" toasts
   - pulls the live roster from /api/wom, with a graceful fallback */

const CONFIG = {
  discordInvite: "https://discord.gg/kT4vEGnjgU",
  rosterPreviewCount: 8,
};

// Ranks we have icons for (assets/ranks/<role>.png). Others fall back to a chevron.
const ICON_ROLES = new Set([
  "owner", "deputy_owner", "administrator", "colonel", "lieutenant", "marshal", "ninja",
  "paladin", "knight", "expert", "inquisitor", "striker", "duellist", "beast", "squire",
]);
function rankMark(role) {
  return ICON_ROLES.has(role)
    ? `<img class="rank-icon" src="assets/ranks/${role}.png" alt="" width="18" height="18" loading="lazy">`
    : `<span class="chev"></span>`;
}

// Shown only if the live fetch fails (offline preview, WOM down, etc.)
const ROSTER_FALLBACK = [
  { name: "mr flsh", username: "mr flsh", role: "owner", rankLabel: "Owner" },
  { name: "koi ox", username: "koi ox", role: "deputy_owner", rankLabel: "Deputy Owner" },
  { name: "StWidu93", username: "stwidu93", role: "deputy_owner", rankLabel: "Deputy Owner" },
  { name: "Bwita", username: "bwita", role: "colonel", rankLabel: "Colonel" },
  { name: "Artolux", username: "artolux", role: "captain", rankLabel: "Captain" },
  { name: "Vilence", username: "vilence", role: "inquisitor", rankLabel: "Inquisitor" },
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function wireDiscordLinks() {
  document.querySelectorAll("[data-discord]").forEach((el) => {
    el.setAttribute("href", CONFIG.discordInvite);
    if (CONFIG.discordInvite !== "#") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
  });
}

function wireNav() {
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");
  if (burger && nav) burger.addEventListener("click", () => nav.classList.toggle("open"));
}

function wireToasts() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  let t;
  document.querySelectorAll(".soon").forEach((b) => {
    b.addEventListener("click", () => {
      toast.textContent = b.getAttribute("data-soon");
      toast.classList.add("show");
      clearTimeout(t);
      t = setTimeout(() => toast.classList.remove("show"), 2200);
    });
  });
}

function rosterRow(m) {
  const cls = "rank rank--" + esc(m.role || "member");
  const profile = m.username
    ? `https://wiseoldman.net/players/${encodeURIComponent(m.username)}`
    : null;
  const nameHtml = profile
    ? `<a href="${profile}" target="_blank" rel="noopener">${esc(m.name)}</a>`
    : esc(m.name);
  return (
    `<tr><td class="ign">${nameHtml}</td>` +
    `<td><span class="${cls}">${rankMark(m.role)}${esc(m.rankLabel)}</span></td></tr>`
  );
}

function renderRoster(members, { cached } = {}) {
  const body = document.getElementById("roster-body");
  if (!body) return;
  const full = body.dataset.full === "1";
  const list = full ? members : members.slice(0, CONFIG.rosterPreviewCount);
  body.innerHTML = list.map(rosterRow).join("");
  const badge = document.getElementById("roster-count");
  if (badge) {
    const total = members.length;
    badge.textContent = cached
      ? `⟳ ${total}+ members · WOM (cached)`
      : `⟳ ${total} members · WOM`;
  }
}

async function loadRoster() {
  const body = document.getElementById("roster-body");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="2" class="roster-msg">Loading roster…</td></tr>`;
  try {
    const r = await fetch("/api/wom", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status " + r.status);
    const data = await r.json();
    if (!data || !Array.isArray(data.members) || !data.members.length) throw new Error("empty");
    renderRoster(data.members, { cached: false });
  } catch (e) {
    // graceful degrade: show the bundled snapshot rather than an empty panel
    renderRoster(ROSTER_FALLBACK, { cached: true });
  }
}

function relTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24); if (d < 7) return d + "d ago";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function newsCard(item) {
  const pin = item.avatar
    ? `<div class="pin" style="padding:0;overflow:hidden"><img src="${esc(item.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`
    : `<div class="pin">NEWS</div>`;
  const time = item.timestamp ? `<time>${esc(relTime(item.timestamp))} · ${esc(item.author)}</time>` : `<time>${esc(item.author)}</time>`;
  const body = item.bodyHtml ? `<p>${item.bodyHtml}</p>` : "";
  const img = item.image
    ? `<p><img src="${esc(item.image)}" alt="" loading="lazy" style="max-width:100%;border:2px solid #000;border-radius:6px;margin-top:6px"></p>`
    : "";
  return `<div class="news-item">${pin}<div><h3>${item.titleHtml}</h3>${time}${body}${img}</div></div>`;
}

async function loadNews() {
  const body = document.getElementById("news-body");
  if (!body) return;
  try {
    const r = await fetch("/api/news", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status");
    const data = await r.json();
    // not configured yet, or nothing to show -> keep the sample content in place
    if (!data || !data.configured || !Array.isArray(data.items) || !data.items.length) return;
    body.innerHTML = data.items.map(newsCard).join("");
    const badge = document.getElementById("news-badge");
    if (badge) badge.textContent = "⟳ from #announcements";
  } catch (e) {
    /* keep sample */
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireDiscordLinks();
  wireNav();
  wireToasts();
  loadRoster();
  loadNews();
});

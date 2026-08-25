/* Multi-Misfits — front-end behaviour
   - wires the Join / Discord links from one place (CONFIG)
   - mobile nav + "coming soon" toasts
   - pulls the live roster from /api/wom, with a graceful fallback
   - full roster page: search, rank filter, sortable columns, pagination */

const CONFIG = {
  discordInvite: "https://discord.gg/kT4vEGnjgU",
  rosterPreviewCount: 8,
};

const ICON_ROLES = new Set([
  "owner", "deputy_owner", "administrator", "captain", "colonel", "lieutenant", "marshal", "ninja",
  "paladin", "knight", "expert", "inquisitor", "striker", "duellist", "beast", "squire",
]);
function rankMark(role) {
  return ICON_ROLES.has(role)
    ? `<img class="rank-icon" src="assets/ranks/${role}.png" alt="" width="18" height="18" loading="lazy">`
    : `<span class="chev"></span>`;
}

const ROSTER_FALLBACK = [
  { name: "mr flsh", username: "mr flsh", role: "owner", rankLabel: "Owner", priority: 120, exp: 0 },
  { name: "koi ox", username: "koi ox", role: "deputy_owner", rankLabel: "Deputy Owner", priority: 110, exp: 0 },
  { name: "StWidu93", username: "stwidu93", role: "deputy_owner", rankLabel: "Deputy Owner", priority: 110, exp: 0 },
  { name: "Bwita", username: "bwita", role: "colonel", rankLabel: "Colonel", priority: 95, exp: 0 },
  { name: "Artolux", username: "artolux", role: "captain", rankLabel: "Captain", priority: 90, exp: 0 },
  { name: "Vilence", username: "vilence", role: "inquisitor", rankLabel: "Inquisitor", priority: 50, exp: 0 },
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function capitalizeName(name) {
  if (!name) return "";
  const first = name.charAt(0);
  if (first >= "0" && first <= "9") return name;
  return first.toUpperCase() + name.slice(1);
}

function formatXP(xp) {
  if (typeof xp !== "number" || xp <= 0) return "—";
  if (xp >= 1e9) return (xp / 1e9).toFixed(1) + "B";
  if (xp >= 1e6) return (xp / 1e6).toFixed(1) + "M";
  if (xp >= 1e3) return Math.round(xp / 1e3) + "K";
  return xp.toLocaleString();
}

/* ---- roster state (full page only) ---- */
const ROSTER_PAGE_SIZE = 20;
const rosterState = {
  all: [],
  search: "",
  filter: "",
  sort: "rank",
  sortDesc: true,
  page: 1,
};

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

function rosterRow(m, showXP) {
  const cls = "rank rank--" + esc(m.role || "member");
  const displayName = capitalizeName(m.name);
  const profile = m.username
    ? `https://wiseoldman.net/players/${encodeURIComponent(m.username)}`
    : null;
  const nameHtml = profile
    ? `<a href="${profile}" target="_blank" rel="noopener">${esc(displayName)}</a>`
    : esc(displayName);
  let html = `<tr><td class="ign">${nameHtml}</td>` +
    `<td><span class="${cls}">${rankMark(m.role)}${esc(m.rankLabel)}</span></td>`;
  if (showXP) {
    html += `<td class="xp-cell">${formatXP(m.exp)}</td>`;
  }
  html += "</tr>";
  return html;
}

function renderRoster(members, { cached } = {}) {
  const body = document.getElementById("roster-body");
  if (!body) return;
  const full = body.dataset.full === "1";

  if (full) {
    rosterState.all = members;
    const controls = document.getElementById("roster-controls");
    if (controls) controls.style.display = "";
    populateRankFilter(members);
    renderFullRoster();
    return;
  }

  const list = members.slice(0, CONFIG.rosterPreviewCount);
  body.innerHTML = list.map((m) => rosterRow(m, false)).join("");
  const badge = document.getElementById("roster-count");
  if (badge) {
    badge.textContent = cached
      ? `⟳ ${members.length}+ members · WOM (cached)`
      : `⟳ ${members.length} members · WOM`;
  }
}

function getFilteredRoster() {
  let list = rosterState.all.slice();

  if (rosterState.search) {
    const q = rosterState.search.toLowerCase();
    list = list.filter((m) => m.name.toLowerCase().includes(q));
  }

  if (rosterState.filter) {
    list = list.filter((m) => m.role === rosterState.filter);
  }

  list.sort((a, b) => {
    let cmp = 0;
    switch (rosterState.sort) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "xp":
        cmp = (a.exp || 0) - (b.exp || 0);
        break;
      case "rank":
      default:
        cmp = (a.priority || 0) - (b.priority || 0);
        if (cmp === 0) cmp = (a.exp || 0) - (b.exp || 0);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
    }
    return rosterState.sortDesc ? -cmp : cmp;
  });

  return list;
}

function renderFullRoster() {
  const body = document.getElementById("roster-body");
  if (!body) return;

  const filtered = getFilteredRoster();
  const totalPages = Math.ceil(filtered.length / ROSTER_PAGE_SIZE) || 1;
  if (rosterState.page > totalPages) rosterState.page = totalPages;
  if (rosterState.page < 1) rosterState.page = 1;

  const start = (rosterState.page - 1) * ROSTER_PAGE_SIZE;
  const page = filtered.slice(start, start + ROSTER_PAGE_SIZE);

  body.innerHTML = page.length
    ? page.map((m) => rosterRow(m, true)).join("")
    : '<tr><td colspan="3" class="roster-msg">No players found</td></tr>';

  const badge = document.getElementById("roster-count");
  if (badge) {
    const showing = filtered.length !== rosterState.all.length
      ? `${filtered.length} of ${rosterState.all.length}`
      : `${rosterState.all.length}`;
    badge.textContent = `⟳ ${showing} members · WOM`;
  }

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === rosterState.sort) {
      th.classList.add(rosterState.sortDesc ? "sort-desc" : "sort-asc");
    }
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById("roster-pagination");
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const p = rosterState.page;
  container.innerHTML =
    `<button ${p <= 1 ? "disabled" : ""} data-page="1">«</button>` +
    `<button ${p <= 1 ? "disabled" : ""} data-page="${p - 1}">‹ Prev</button>` +
    `<span class="page-info">Page ${p} of ${totalPages}</span>` +
    `<button ${p >= totalPages ? "disabled" : ""} data-page="${p + 1}">Next ›</button>` +
    `<button ${p >= totalPages ? "disabled" : ""} data-page="${totalPages}">»</button>`;

  container.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rosterState.page = parseInt(btn.dataset.page);
      renderFullRoster();
    });
  });
}

function populateRankFilter(members) {
  const select = document.getElementById("roster-filter");
  if (!select) return;

  const seen = new Set();
  const ranks = [];
  members.forEach((m) => {
    if (!seen.has(m.role)) {
      seen.add(m.role);
      ranks.push({ role: m.role, label: m.rankLabel, priority: m.priority || 0 });
    }
  });
  ranks.sort((a, b) => b.priority - a.priority);

  select.innerHTML = '<option value="">All Ranks</option>' +
    ranks.map((r) => `<option value="${esc(r.role)}">${esc(r.label)}</option>`).join("");
}

function wireRosterControls() {
  const search = document.getElementById("roster-search");
  const filter = document.getElementById("roster-filter");

  if (search) {
    search.addEventListener("input", () => {
      rosterState.search = search.value.trim();
      rosterState.page = 1;
      renderFullRoster();
    });
  }

  if (filter) {
    filter.addEventListener("change", () => {
      rosterState.filter = filter.value;
      rosterState.page = 1;
      renderFullRoster();
    });
  }

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const sort = th.dataset.sort;
      if (rosterState.sort === sort) {
        rosterState.sortDesc = !rosterState.sortDesc;
      } else {
        rosterState.sort = sort;
        rosterState.sortDesc = sort === "rank" || sort === "xp";
      }
      rosterState.page = 1;
      renderFullRoster();
    });
  });
}

async function loadRoster() {
  const body = document.getElementById("roster-body");
  if (!body) return;
  const cols = body.dataset.full === "1" ? 3 : 2;
  body.innerHTML = `<tr><td colspan="${cols}" class="roster-msg">Loading roster…</td></tr>`;
  try {
    const r = await fetch("/api/wom", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status " + r.status);
    const data = await r.json();
    if (!data || !Array.isArray(data.members) || !data.members.length) throw new Error("empty");
    renderRoster(data.members, { cached: false });
  } catch (e) {
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
  wireRosterControls();
  loadRoster();
  loadNews();
});

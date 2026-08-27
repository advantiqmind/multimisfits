/* Multi-Misfits — front-end behaviour
   - wires the Join / Discord links from one place (CONFIG)
   - mobile nav + "coming soon" toasts
   - pulls the live roster from /api/wom, with a graceful fallback
   - full roster page: search, rank filter, sortable columns, pagination
   - events page: featured event, upcoming/past grids from /api/events */

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
  if (typeof xp !== "number" || xp <= 0) return "-";
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
    el.setAttribute("href", "#");
    el.removeAttribute("target");
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var saved = localStorage.getItem("mm-referral");
      if (saved) {
        window.open(saved, "_blank", "noopener");
      } else {
        openReferralModal();
      }
    });
  });
}

function openReferralModal() {
  var overlay = document.getElementById("referral-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "referral-overlay";
    overlay.className = "ref-overlay";
    overlay.innerHTML =
      '<div class="ref-modal">' +
      '<button class="ref-close" aria-label="Close">&times;</button>' +
      '<h3>Enter Invite Code</h3>' +
      '<p>Got a referral code from a clan member? Enter it below to join.</p>' +
      '<div class="ref-form">' +
      '<input type="text" id="ref-input" class="ref-input" placeholder="Enter code" maxlength="30" autocomplete="off" spellcheck="false">' +
      '<button class="btn join ref-submit" id="ref-submit">JOIN</button>' +
      '</div>' +
      '<div class="ref-msg" id="ref-msg"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector(".ref-close").addEventListener("click", closeReferralModal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeReferralModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) closeReferralModal();
    });

    var input = document.getElementById("ref-input");
    var submit = document.getElementById("ref-submit");

    function doSubmit() {
      var code = input.value.trim();
      if (!code) return;
      var msg = document.getElementById("ref-msg");
      msg.textContent = "Checking...";
      msg.style.color = "var(--gold-dim)";
      submit.disabled = true;

      fetch("/api/referral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.valid && data.invite) {
            localStorage.setItem("mm-referral", data.invite);
            msg.textContent = "Code accepted! Redirecting...";
            msg.style.color = "#3a8a3a";
            setTimeout(function () {
              closeReferralModal();
              window.open(data.invite, "_blank", "noopener");
            }, 800);
          } else if (data.error === "not_configured") {
            localStorage.setItem("mm-referral", CONFIG.discordInvite);
            msg.textContent = "";
            closeReferralModal();
            window.open(CONFIG.discordInvite, "_blank", "noopener");
          } else {
            msg.textContent = "Invalid code. Try again or ask a clan member.";
            msg.style.color = "#e04040";
          }
          submit.disabled = false;
        })
        .catch(function () {
          localStorage.setItem("mm-referral", CONFIG.discordInvite);
          closeReferralModal();
          window.open(CONFIG.discordInvite, "_blank", "noopener");
          submit.disabled = false;
        });
    }

    submit.addEventListener("click", doSubmit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") doSubmit(); });
  }

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(function () { document.getElementById("ref-input").focus(); }, 100);
}

function closeReferralModal() {
  var overlay = document.getElementById("referral-overlay");
  if (overlay) {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
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

function rosterRow(m, showXP, num) {
  const cls = "rank rank--" + esc(m.role || "member");
  const displayName = capitalizeName(m.name);
  const profile = m.username
    ? `https://wiseoldman.net/players/${encodeURIComponent(m.username)}`
    : null;
  const nameHtml = profile
    ? `<a href="${profile}" target="_blank" rel="noopener">${esc(displayName)}</a>`
    : esc(displayName);
  let html = "<tr>";
  if (num != null) html += `<td class="rank-num">${num}</td>`;
  html += `<td class="ign">${nameHtml}</td>` +
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
    ? page.map((m, i) => rosterRow(m, true, start + i + 1)).join("")
    : '<tr><td colspan="4" class="roster-msg">No players found</td></tr>';

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
    ? `<p><img src="${esc(item.image)}" alt="" loading="lazy" style="max-width:100%;max-height:320px;object-fit:contain;border:2px solid #000;border-radius:6px;margin-top:6px"></p>`
    : "";
  return `<div class="news-item">${pin}<div><h3>${item.titleHtml}</h3>${time}${body}${img}</div></div>`;
}

const NEWS_PAGE_SIZE = 5;
const newsState = { items: [], page: 1 };

function renderNewsPagination() {
  var container = document.getElementById("news-pagination");
  if (!container) return;
  var total = Math.ceil(newsState.items.length / NEWS_PAGE_SIZE) || 1;
  if (total <= 1) { container.innerHTML = ""; return; }
  var p = newsState.page;
  container.innerHTML =
    `<button ${p <= 1 ? "disabled" : ""} data-np="${p - 1}">&#8249; Prev</button>` +
    `<span class="page-info">Page ${p} of ${total}</span>` +
    `<button ${p >= total ? "disabled" : ""} data-np="${p + 1}">Next &#8250;</button>`;
  container.querySelectorAll("button[data-np]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      newsState.page = parseInt(btn.dataset.np);
      renderNewsPage();
    });
  });
}

function renderNewsPage() {
  var body = document.getElementById("news-body");
  if (!body) return;
  var start = (newsState.page - 1) * NEWS_PAGE_SIZE;
  var page = newsState.items.slice(start, start + NEWS_PAGE_SIZE);
  body.innerHTML = page.map(newsCard).join("");
  renderNewsPagination();
}

async function loadNews() {
  const body = document.getElementById("news-body");
  if (!body) return;
  try {
    const r = await fetch("/api/news", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status");
    const data = await r.json();
    if (!data || !data.configured || !Array.isArray(data.items) || !data.items.length) return;
    newsState.items = data.items;
    newsState.page = 1;
    renderNewsPage();
    const badge = document.getElementById("news-badge");
    if (badge) badge.textContent = "⟳ from #announcements";
  } catch (e) {
    /* keep sample */
  }
}

/* ---- achievements ---- */
const ACH_LABELS = { pet: "Pet", drop: "Loot Drop", ca: "Combat Achievement", max: "Maxed", xp: "XP Milestone", quest: "Quest", clue: "Clue Scroll", pb: "Personal Best", default: "Achievement" };
const ACH_COLORS = { pet: "#5bc0de", drop: "#ffcb2f", ca: "#e04040", max: "#ff9900", xp: "#4ad04a", quest: "#c090ff", clue: "#d99f1c", pb: "#4a90d9", default: "#999" };

function achThumb(item) {
  var src = item.thumbnail || item.image || "";
  if (!src) return "";
  return `<a class="ach-thumb lightbox-trigger" href="${esc(item.image || item.thumbnail)}"><img src="${esc(src)}" alt="" loading="lazy"></a>`;
}

function achItem(item, full) {
  var label = ACH_LABELS[item.type] || "Achievement";
  var color = ACH_COLORS[item.type] || ACH_COLORS.default;
  var time = item.timestamp ? relTime(item.timestamp) : "";
  var detail = item.detail || "";
  var what = item.what || label;
  var tagHtml = `<span class="ach-tag" style="border-color:${color};color:${color}">${esc(label)}</span>`;
  var thumb = achThumb(item);
  if (full) {
    return `<div class="ach ach-full">` +
      `<div class="medal">${esc(item.medal)}</div>` +
      `<div class="ach-info">` +
        `<div class="ach-row"><span class="who">${esc(item.player)}</span>${tagHtml}</div>` +
        `<div class="what">${esc(what)}</div>` +
        (detail ? `<div class="ach-detail">${esc(detail)}</div>` : "") +
        (time ? `<div class="ach-meta">${esc(time)}</div>` : "") +
      `</div>${thumb}</div>`;
  }
  return `<div class="ach">` +
    `<div class="medal">${esc(item.medal)}</div>` +
    `<div class="ach-info">` +
      `<div class="who">${esc(item.player)}</div>` +
      `<div class="what">${esc(what)}</div>` +
      `<div class="ach-meta">${esc(label)}${time ? " · " + esc(time) : ""}</div>` +
    `</div>${thumb}</div>`;
}

const ACH_PAGE_SIZE = 12;
const achState = { items: [], page: 1 };

function renderAchPage() {
  var body = document.getElementById("ach-full-body");
  if (!body) return;
  var total = Math.ceil(achState.items.length / ACH_PAGE_SIZE) || 1;
  if (achState.page > total) achState.page = total;
  var start = (achState.page - 1) * ACH_PAGE_SIZE;
  var page = achState.items.slice(start, start + ACH_PAGE_SIZE);
  body.innerHTML = page.length
    ? page.map(function (i) { return achItem(i, true); }).join("")
    : '<p class="ev-empty">No achievements yet. Set up the Dink plugin!</p>';

  var pag = document.getElementById("ach-pagination");
  if (!pag) return;
  if (total <= 1) { pag.innerHTML = ""; return; }
  var p = achState.page;
  pag.innerHTML =
    `<button ${p <= 1 ? "disabled" : ""} data-ap="${p - 1}">&#8249; Prev</button>` +
    `<span class="page-info">Page ${p} of ${total}</span>` +
    `<button ${p >= total ? "disabled" : ""} data-ap="${p + 1}">Next &#8250;</button>`;
  pag.querySelectorAll("button[data-ap]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      achState.page = parseInt(btn.dataset.ap);
      renderAchPage();
    });
  });
}

async function loadAchievements() {
  var body = document.getElementById("ach-body");
  var fullBody = document.getElementById("ach-full-body");
  if (!body && !fullBody) return;
  try {
    const r = await fetch("/api/achievements", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status");
    const data = await r.json();
    if (!data || !data.configured || !Array.isArray(data.items) || !data.items.length) return;

    if (body) {
      var preview = data.items.slice(0, 6);
      body.innerHTML = preview.map(function (i) { return achItem(i, false); }).join("");
      var badge = document.getElementById("ach-badge");
      if (badge) badge.textContent = "⟳ from chest";
    }

    if (fullBody) {
      achState.items = data.items;
      achState.page = 1;
      renderAchPage();
      var fullBadge = document.getElementById("ach-full-badge");
      if (fullBadge) fullBadge.textContent = "⟳ from chest";
    }
  } catch (e) {
    /* keep sample */
  }
}

/* ---- spotlight ---- */
async function loadSpotlight() {
  var container = document.getElementById("spotlight-container");
  if (!container) return;
  try {
    var r = await fetch("/api/spotlight", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status");
    var data = await r.json();
    if (!data || !data.configured || !data.spotlight) return;
    var s = data.spotlight;
    var time = s.timestamp ? relTime(s.timestamp) : "";
    var caption = s.caption || "Clan Spotlight";
    container.innerHTML =
      `<a class="spotlight lightbox-trigger" href="${esc(s.image)}">` +
        `<div class="spotlight-img"><img src="${esc(s.image)}" alt="${esc(caption)}" loading="lazy"></div>` +
        `<div class="spotlight-info">` +
          `<div class="spotlight-label">Spotlight</div>` +
          `<div class="spotlight-caption">${esc(caption)}</div>` +
          `<div class="spotlight-meta">Posted by ${esc(s.author)}${time ? " · " + esc(time) : ""}</div>` +
        `</div>` +
      `</a>`;
  } catch (e) {
    /* no spotlight, no problem */
  }
}

/* ---- gallery ---- */
const GALLERY_PAGE_SIZE = 6;
const galleryState = { items: [], page: 1 };

function galleryCard(item) {
  var src = item.image || item.thumbnail || "";
  var caption = esc(item.player) + ": " + esc(item.what);
  return `<a class="shot lightbox-trigger" href="${esc(src)}"><img src="${esc(src)}" alt="${caption}" loading="lazy"></a>`;
}

function renderGalleryPage() {
  var body = document.getElementById("gallery-body");
  if (!body) return;
  var total = Math.ceil(galleryState.items.length / GALLERY_PAGE_SIZE) || 1;
  if (galleryState.page > total) galleryState.page = total;
  var start = (galleryState.page - 1) * GALLERY_PAGE_SIZE;
  var page = galleryState.items.slice(start, start + GALLERY_PAGE_SIZE);
  body.innerHTML = page.length
    ? '<div class="shots shots-gallery">' + page.map(galleryCard).join("") + "</div>"
    : '<p class="ev-empty">No screenshots yet. Set up the Dink plugin!</p>';

  var pag = document.getElementById("gallery-pagination");
  if (!pag) return;
  if (total <= 1) { pag.innerHTML = ""; return; }
  var p = galleryState.page;
  pag.innerHTML =
    `<button ${p <= 1 ? "disabled" : ""} data-gp="${p - 1}">&#8249; Prev</button>` +
    `<span class="page-info">Page ${p} of ${total}</span>` +
    `<button ${p >= total ? "disabled" : ""} data-gp="${p + 1}">Next &#8250;</button>`;
  pag.querySelectorAll("button[data-gp]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      galleryState.page = parseInt(btn.dataset.gp);
      renderGalleryPage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

async function loadGallery() {
  var body = document.getElementById("gallery-body");
  if (!body) return;
  try {
    var r = await fetch("/api/achievements?limit=100", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status");
    var data = await r.json();
    if (!data || !data.configured || !Array.isArray(data.items)) return;
    var withImages = data.items.filter(function (i) { return i.image; });
    if (!withImages.length) return;
    galleryState.items = withImages;
    galleryState.page = 1;
    renderGalleryPage();
    var badge = document.getElementById("gallery-badge");
    if (badge) badge.textContent = "from chest";
  } catch (e) {
    /* keep static fallback */
  }
}

/* ---- events ---- */
const EVENTS_FALLBACK = [
  {
    id: "sample-1", name: "Bond Giveaway: Round 2",
    description: "Enter to win a bond! Post a screenshot of your best PvM drop in #events for a FREE entry.\n\nDonation tiers:\n• 500K GP = 1 extra duck\n• 1M GP = 3 extra ducks\n• 2M GP = 5 extra ducks + gold name\n\nAll donations go to the clan prize pool. Duck Race finale at 8 PM GMT!",
    startTime: "2026-09-01T20:00:00Z", endTime: "2026-09-01T22:00:00Z",
    status: "scheduled", interestedCount: 23,
  },
  {
    id: "sample-2", name: "CoX Mass Night",
    description: "Chambers of Xeric mass run. All levels welcome. Voice required.",
    startTime: "2026-08-28T20:00:00Z", status: "scheduled", interestedCount: 15,
  },
  {
    id: "sample-3", name: "Skill of the Week: Mining",
    description: "Mine the most XP this week. Top 3 win prizes from the clan bank.",
    startTime: "2026-09-01T00:00:00Z", endTime: "2026-09-07T23:59:00Z",
    status: "scheduled", interestedCount: 8,
  },
  {
    id: "sample-4", name: "PvP Tournament",
    description: "1v1 bracket tournament. Sign up in Discord. 5M prize pool.",
    startTime: "2026-09-06T21:00:00Z", status: "scheduled", interestedCount: 12,
  },
  {
    id: "sample-5", name: "Bond Giveaway: Round 1",
    description: "Congratulations to Vilence for winning the first bond giveaway!",
    startTime: "2026-08-15T20:00:00Z", status: "completed", interestedCount: 31,
  },
  {
    id: "sample-6", name: "ToB Learning Raid",
    description: "Theatre of Blood learning run for first-timers. Great turnout!",
    startTime: "2026-08-10T19:00:00Z", status: "completed", interestedCount: 18,
  },
];

function formatDiscord(text) {
  let t = String(text || "");
  t = t.replace(/<a?:[^:>]+:\d+>/g, "");
  t = t.replace(/\[LIVE\]/gi, "");
  t = t.replace(/<@!?\d+>/g, "");
  t = t.replace(/<@&\d+>/g, "@role");
  t = t.replace(/<#\d+>/g, "#channel");
  t = t.replace(/<t:(\d+)(?::([tTdDfFR]))?>/g, function(_, epoch, flag) {
    var d = new Date(parseInt(epoch, 10) * 1000);
    if (flag === "R") {
      var diff = d.getTime() - Date.now();
      var abs = Math.abs(diff);
      var future = diff > 0;
      if (abs < 60000) return "just now";
      if (abs < 3600000) { var m = Math.floor(abs / 60000); return future ? "in " + m + " minute" + (m > 1 ? "s" : "") : m + " minute" + (m > 1 ? "s" : "") + " ago"; }
      if (abs < 86400000) { var h = Math.floor(abs / 3600000); return future ? "in " + h + " hour" + (h > 1 ? "s" : "") : h + " hour" + (h > 1 ? "s" : "") + " ago"; }
      if (abs < 604800000) { var dd = Math.floor(abs / 86400000); return future ? "in " + dd + " day" + (dd > 1 ? "s" : "") : dd + " day" + (dd > 1 ? "s" : "") + " ago"; }
      var w = Math.floor(abs / 604800000); return future ? "in " + w + " week" + (w > 1 ? "s" : "") : w + " week" + (w > 1 ? "s" : "") + " ago";
    }
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      + " at " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  });
  t = t.replace(/@(everyone|here)/gi, "");
  t = t.replace(/\[([^\]]+)\]\(https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com[^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?/g, "");
  t = t.replace(/^\s+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = esc(t);
  t = t.replace(/```([\s\S]*?)```/g, "$1");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<u>$1</u>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  t = t.replace(/(^|<br>|\n)### ([^\n<]+)/g, '$1<h4 class="dc-h3">$2</h4>');
  t = t.replace(/(^|<br>|\n)## ([^\n<]+)/g, '$1<h3 class="dc-h2">$2</h3>');
  t = t.replace(/(^|<br>|\n)# ([^\n<]+)/g, '$1<h3 class="dc-h1">$2</h3>');
  t = t.replace(/\n/g, "<br>");
  return t;
}

let _eventsData = [];

function formatEventDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatEventTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function eventCountdown(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  let s = "";
  if (d > 0) s += d + "d ";
  if (h > 0 || d > 0) s += h + "h ";
  s += m + "m";
  return s.trim();
}

function hasLiveTag(ev) {
  return /\[LIVE\]/i.test(ev.name || "") || /\[LIVE\]/i.test(ev.description || "");
}

function cleanName(name) {
  return (name || "").replace(/\s*\[LIVE\]\s*/gi, " ").trim();
}

function computeEventStatus(ev) {
  if (ev.status === "completed" && !hasLiveTag(ev)) return "completed";
  if (hasLiveTag(ev)) return "live";
  if (ev.hasParsedDate && new Date(ev.startTime).getTime() <= Date.now()) {
    if (ev.endTime && new Date(ev.endTime).getTime() < Date.now()) return "completed";
    return "live";
  }
  return "scheduled";
}

function eventStatusBadge(status) {
  if (status === "live") return '<span class="ev-status ev-live"><span class="ev-live-dot"></span>LIVE</span>';
  if (status === "completed") return '<span class="ev-status ev-ended">ENDED</span>';
  return '<span class="ev-status ev-upcoming">UPCOMING</span>';
}

function featuredEventHtml(ev) {
  var effStatus = computeEventStatus(ev);
  const badge = eventStatusBadge(effStatus);
  const isLive = effStatus === "live";
  const countdown = ev.hasParsedDate && !isLive && effStatus === "scheduled" ? eventCountdown(ev.startTime) : null;
  const dateStr = ev.hasParsedDate ? formatEventDate(ev.startTime) : "Date TBA";
  const endStr = ev.hasParsedDate && ev.endTime ? " - " + formatEventDate(ev.endTime) : "";
  const timeStr = ev.hasParsedDate && !isLive ? formatEventTime(ev.startTime) : "";
  const desc = ev.description ? formatDiscord(ev.description) : "";
  const interested = ev.interestedCount
    ? `<div class="ev-interested">${ev.interestedCount} replies</div>` : "";
  const countdownHtml = isLive
    ? '<div class="ev-happening">HAPPENING NOW</div>'
    : countdown ? `<div class="ev-countdown" data-countdown="${esc(ev.startTime)}">${countdown}</div>` : "";
  const imgStyle = ev.image
    ? ` style="background:linear-gradient(to bottom,rgba(18,13,6,.82),rgba(18,13,6,.95)),url('${esc(ev.image)}') center/cover;"`
    : "";
  const metaText = timeStr ? `${dateStr}${endStr} · ${timeStr}` : `${dateStr}${endStr}`;

  return `<div class="ev-featured"${imgStyle}>
    <div class="ev-featured-header"><h3>${esc(cleanName(ev.name))}</h3>${badge}</div>
    <div class="ev-featured-meta">
      <span class="ev-date-text">${metaText}</span>
      ${countdownHtml}${interested}
    </div>
    ${desc ? `<div class="ev-desc">${desc}</div>` : ""}
    <div class="ev-cta">
      <a class="btn join" data-discord href="#" aria-label="Join Discord for event details">
        <svg fill="#1a1305" aria-hidden="true" style="width:16px;height:12px;vertical-align:-1px;margin-right:7px"><use href="#discord"/></svg>
        RSVP on Discord
      </a>
    </div>
  </div>`;
}

function homeEventCard(ev) {
  var effStatus = computeEventStatus(ev);
  const d = new Date(ev.startTime);
  const day = ev.hasParsedDate ? d.getDate() : "DATE";
  const month = ev.hasParsedDate ? d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TBA";
  const timeStr = ev.hasParsedDate && effStatus !== "live" ? formatEventTime(ev.startTime) : "";
  const liveBadge = effStatus === "live" ? '<div class="when" style="color:#e04040">LIVE</div>' : "";
  return `<div class="event"><div class="date${ev.hasParsedDate ? "" : " date-tba"}"><div class="d">${day}</div><div class="m">${esc(month)}</div></div><div><h3>${esc(cleanName(ev.name))}</h3>${liveBadge || (timeStr ? `<div class="when">${timeStr}</div>` : "")}</div></div>`;
}

function renderHomeEvents(events) {
  var body = document.getElementById("home-events-body");
  if (!body) return;
  var liveEvs = events.filter(function(e) { return computeEventStatus(e) === "live"; });
  var upcomingEvs = events.filter(function(e) { return computeEventStatus(e) === "scheduled"; });
  var show = liveEvs.concat(upcomingEvs).slice(0, 3);
  if (!show.length) return;
  body.innerHTML = show.map(homeEventCard).join("");
  var badge = document.getElementById("home-events-badge");
  if (badge) badge.textContent = "from Discord";
  showLiveFab(liveEvs.length > 0);
}

function showLiveFab(hasLive) {
  var existing = document.getElementById("ev-fab");
  if (!hasLive) { if (existing) existing.classList.add("ev-fab-hidden"); return; }
  if (existing) { existing.classList.remove("ev-fab-hidden"); return; }
  if (sessionStorage.getItem("ev-fab-closed")) return;
  var fab = document.createElement("a");
  fab.id = "ev-fab";
  fab.className = "ev-fab";
  fab.href = "/events.html";
  fab.innerHTML = '<span class="ev-live-dot"></span>LIVE EVENT<button class="ev-fab-close" aria-label="Close">&times;</button>';
  document.body.appendChild(fab);
  fab.querySelector(".ev-fab-close").addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    fab.classList.add("ev-fab-hidden");
    sessionStorage.setItem("ev-fab-closed", "1");
  });
  var dragState = null;
  fab.addEventListener("pointerdown", function(e) {
    if (e.target.closest(".ev-fab-close")) return;
    dragState = { sx: e.clientX, sy: e.clientY, ox: fab.offsetLeft, oy: fab.offsetTop, moved: false };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener("pointermove", function(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.moved = true;
    if (!dragState.moved) return;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
    fab.style.left = Math.max(0, dragState.ox + dx) + "px";
    fab.style.top = Math.max(0, dragState.oy + dy) + "px";
  });
  fab.addEventListener("pointerup", function(e) {
    if (dragState && dragState.moved) e.preventDefault();
    dragState = null;
  });
  fab.addEventListener("click", function(e) {
    if (fab.style.left) {
      var rect = fab.getBoundingClientRect();
      if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) return;
    }
  });
}

function eventCard(ev) {
  var effStatus = computeEventStatus(ev);
  const d = new Date(ev.startTime);
  const day = ev.hasParsedDate ? d.getDate() : "DATE";
  const month = ev.hasParsedDate ? d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TBA";
  const badge = eventStatusBadge(effStatus);
  const isLive = effStatus === "live";
  const timeStr = ev.hasParsedDate && effStatus !== "completed" && !isLive ? formatEventTime(ev.startTime) : "";
  const liveText = isLive ? "Started " + formatEventDate(ev.startTime) : "";
  const interested = ev.interestedCount ? `${ev.interestedCount} replies` : "";
  const bgStyle = ev.image
    ? ` style="background:linear-gradient(to right,rgba(18,13,6,.92),rgba(18,13,6,.7)),url('${esc(ev.image)}') center/cover;"`
    : "";
  const liveClass = isLive ? " ev-card-live" : "";

  return `<div class="ev-card ev-clickable${liveClass}" data-ev-id="${esc(ev.id)}"${bgStyle}>
    <div class="ev-card-date${ev.hasParsedDate ? "" : " date-tba"}"><div class="d">${day}</div><div class="m">${esc(month)}</div></div>
    <div class="ev-card-info">
      <h3>${esc(cleanName(ev.name))}</h3>
      <div class="ev-card-meta">${liveText || timeStr}${(liveText || timeStr) && interested ? " · " : ""}${interested}</div>
    </div>
    ${badge}
  </div>`;
}

function renderEvents(events, { cached } = {}) {
  _eventsData = events;
  const featuredBody = document.getElementById("featured-body");
  const liveBody = document.getElementById("live-body");
  const liveWrap = document.getElementById("live-events-wrap");
  const upcomingBody = document.getElementById("upcoming-body");
  const pastBody = document.getElementById("past-body");
  if (!featuredBody && !upcomingBody && !pastBody) return;

  var live = events.filter(function(e) { return computeEventStatus(e) === "live"; });
  var upcoming = events.filter(function(e) { return computeEventStatus(e) === "scheduled"; });
  var past = events.filter(function(e) { return computeEventStatus(e) === "completed"; });

  live.sort(function(a, b) {
    if (a.endTime && b.endTime) return new Date(a.endTime) - new Date(b.endTime);
    return new Date(b.startTime) - new Date(a.startTime);
  });

  var featured = live[0] || upcoming[0];
  var remainingLive = featured && computeEventStatus(featured) === "live" ? live.slice(1) : live;
  var remainingUpcoming = featured && computeEventStatus(featured) === "scheduled" ? upcoming.slice(1) : upcoming;

  if (featuredBody) {
    featuredBody.innerHTML = featured
      ? featuredEventHtml(featured)
      : '<p class="ev-empty">No featured events right now. Check Discord!</p>';
  }

  if (liveBody && liveWrap) {
    if (remainingLive.length) {
      liveWrap.style.display = "";
      liveBody.innerHTML = remainingLive.map(eventCard).join("");
    } else {
      liveWrap.style.display = "none";
    }
  }

  if (upcomingBody) {
    upcomingBody.innerHTML = remainingUpcoming.length
      ? remainingUpcoming.map(eventCard).join("")
      : '<p class="ev-empty">No upcoming events. Stay tuned!</p>';
  }

  if (pastBody) {
    pastBody.innerHTML = past.length
      ? past.map(eventCard).join("")
      : '<p class="ev-empty">No past events yet.</p>';
  }

  const evBadge = document.getElementById("events-badge");
  if (evBadge) {
    if (cached) { evBadge.textContent = "sample"; }
    else if (featured && computeEventStatus(featured) === "live") {
      evBadge.innerHTML = '<span class="ev-live-dot"></span>LIVE';
      evBadge.style.background = "linear-gradient(180deg,#e04040,#a02020)";
      evBadge.style.color = "#fff";
      evBadge.style.animation = "ev-pulse 2s ease-in-out infinite";
    }
    else { evBadge.textContent = "⟳ from Discord"; }
  }

  wireDiscordLinks();
  startCountdownTimers();
  wireEventModals();
}

function wireEventModals() {
  var overlay = document.getElementById("ev-modal-overlay");
  if (!overlay) return;
  var body = overlay.querySelector(".ev-modal-body");
  var closeBtn = overlay.querySelector(".ev-modal-close");

  function openModal(ev) {
    var effStatus = computeEventStatus(ev);
    var dateStr = formatEventDate(ev.startTime);
    var timeStr = formatEventTime(ev.startTime);
    var badge = eventStatusBadge(effStatus);
    var desc = ev.description ? formatDiscord(ev.description) : '<span style="color:var(--muted)">No description</span>';
    var imgHtml = ev.image
      ? '<img src="' + esc(ev.image) + '" alt="" style="max-width:100%;border:2px solid #000;border-radius:6px;margin-bottom:14px" loading="lazy">'
      : "";
    var replies = ev.interestedCount ? ev.interestedCount + " replies" : "";

    body.innerHTML =
      '<div class="ev-modal-header"><h3>' + esc(cleanName(ev.name)) + '</h3>' + badge + '</div>' +
      '<div class="ev-modal-meta">' + dateStr + ' · ' + timeStr +
      (replies ? ' · ' + replies : '') + '</div>' +
      imgHtml +
      '<div class="ev-modal-desc">' + desc + '</div>' +
      '<div style="margin-top:16px"><a class="btn join" data-discord href="#" aria-label="Join Discord">' +
      '<svg fill="#1a1305" aria-hidden="true" style="width:16px;height:12px;vertical-align:-1px;margin-right:7px"><use href="#discord"/></svg>' +
      'View on Discord</a></div>';

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    wireDiscordLinks();
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });

  document.querySelectorAll(".ev-clickable").forEach(function (card) {
    card.addEventListener("click", function () {
      var id = card.getAttribute("data-ev-id");
      var ev = _eventsData.find(function (e) { return e.id === id; });
      if (ev) openModal(ev);
    });
  });

  var featured = document.querySelector(".ev-featured");
  if (featured) {
    var fev = _eventsData.find(function (e) { return computeEventStatus(e) === "live"; }) ||
              _eventsData.find(function (e) { return computeEventStatus(e) === "scheduled"; });
    if (fev) {
      featured.classList.add("ev-clickable");
      featured.setAttribute("data-ev-id", fev.id);
      featured.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;
        openModal(fev);
      });
    }
  }
}

function startCountdownTimers() {
  if (window._evCountdown) clearInterval(window._evCountdown);
  const els = document.querySelectorAll("[data-countdown]");
  if (!els.length) return;
  window._evCountdown = setInterval(() => {
    els.forEach((el) => {
      const cd = eventCountdown(el.dataset.countdown);
      if (!cd) {
        el.textContent = "HAPPENING NOW";
        el.className = "ev-happening";
      } else {
        el.textContent = cd;
      }
    });
  }, 60000);
}

async function loadEvents() {
  const featuredBody = document.getElementById("featured-body");
  const homeEventsBody = document.getElementById("home-events-body");
  if (!featuredBody && !homeEventsBody) return;
  try {
    const r = await fetch("/api/events", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status " + r.status);
    const data = await r.json();
    if (!data || !data.configured || !Array.isArray(data.events) || !data.events.length) throw new Error("empty");
    if (featuredBody) renderEvents(data.events, { cached: false });
    if (homeEventsBody) renderHomeEvents(data.events);
  } catch (e) {
    if (featuredBody) renderEvents(EVENTS_FALLBACK, { cached: true });
  }
}

function wireGallery() {
  var overlay = document.getElementById("lightbox-overlay");
  if (!overlay) return;
  var img = overlay.querySelector(".lightbox-img");
  var closeBtn = overlay.querySelector(".lightbox-close");

  function open(src) {
    img.src = src;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    img.src = "";
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("open")) close();
  });

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest(".lightbox-trigger");
    if (trigger) {
      e.preventDefault();
      open(trigger.getAttribute("href"));
    }
  });
}

/* ---- giveaway ---- */
const GIVEAWAY_FALLBACK = [
  {
    id: "ga-sample-1", name: "Bond Giveaway: Round 2",
    description: "Prize: 1 Old School Bond\nRate: 1M GP = 1 entry\n\nWhen: <t:1725228000:F>\nEnds: <t:1726012740:F>\n\nPost a screenshot of your donation to the clan bank. A leader will reply with your entry count and confirm with a checkmark.",
    startTime: "2026-09-01T20:00:00Z", endTime: "2026-09-11T22:00:00Z",
    hasParsedDate: true, status: "scheduled",
    prize: "1 Old School Bond", gpPerEntry: 1,
    entries: [
      { player: "Vilence", count: 5, confirmedBy: "mr flsh" },
      { player: "Artolux", count: 3, confirmedBy: "mr flsh" },
      { player: "Bwita", count: 2, confirmedBy: "koi ox" },
    ],
    totalEntries: 10, totalParticipants: 3, gpRaised: 10,
    winners: [], image: null,
  },
  {
    id: "ga-sample-2", name: "Bond Giveaway: Round 1",
    description: "Prize: 1 Bond\nRate: 1M GP = 1 entry",
    startTime: "2026-08-15T20:00:00Z", endTime: "2026-08-25T22:00:00Z",
    hasParsedDate: true, status: "completed",
    prize: "1 Bond", gpPerEntry: 1,
    entries: [], totalEntries: 7, totalParticipants: 4, gpRaised: 7,
    winners: [{ name: "Vilence", message: "Congratulations to Vilence!" }],
    image: null,
  },
];

function formatGP(m) {
  if (m >= 1000) return (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + "B";
  return m + "M";
}

function giveawayStatsHtml(round) {
  return `<div class="ga-stats">
    <div class="ga-stat"><div class="ga-stat-value">${round.totalEntries}</div><div class="ga-stat-label">Entries</div></div>
    <div class="ga-stat"><div class="ga-stat-value">${round.totalParticipants}</div><div class="ga-stat-label">Players</div></div>
    <div class="ga-stat"><div class="ga-stat-value">${formatGP(round.gpRaised)}</div><div class="ga-stat-label">GP Raised</div></div>
    <div class="ga-stat"><div class="ga-stat-value">${esc(round.prize)}</div><div class="ga-stat-label">Prize</div></div>
  </div>`;
}

function giveawayEntriesHtml(entries) {
  if (!entries || !entries.length) return "";
  var rows = entries.map(function(e) {
    return `<div class="ga-entry"><span class="ga-entry-check">&#10003;</span><span class="ga-entry-player">${esc(e.player)}</span><span class="ga-entry-count">${e.count} ${e.count === 1 ? "entry" : "entries"}</span></div>`;
  }).join("");
  return `<h4 class="ga-entries-title">Confirmed Entries</h4>${rows}`;
}

function featuredGiveawayHtml(round) {
  var effStatus = computeEventStatus(round);
  var badge = eventStatusBadge(effStatus);
  var isLive = effStatus === "live";
  var countdown = round.hasParsedDate && !isLive && effStatus === "scheduled" ? eventCountdown(round.startTime) : null;
  var dateStr = round.hasParsedDate ? formatEventDate(round.startTime) : "Date TBA";
  var endStr = round.hasParsedDate && round.endTime ? " - " + formatEventDate(round.endTime) : "";
  var timeStr = round.hasParsedDate && !isLive ? formatEventTime(round.startTime) : "";
  var desc = round.description ? formatDiscord(round.description) : "";
  var countdownHtml = isLive
    ? ''
    : countdown ? `<div class="ev-countdown" data-countdown="${esc(round.startTime)}">${countdown}</div>` : "";
  var metaText = timeStr ? `${dateStr}${endStr} · ${timeStr}` : `${dateStr}${endStr}`;

  return `<div class="ev-featured">
    <div class="ev-featured-header"><h3>${esc(cleanName(round.name))}</h3>${badge}</div>
    <div class="ev-featured-meta">
      <span class="ev-date-text">${metaText}</span>
      ${countdownHtml}
    </div>
    ${giveawayStatsHtml(round)}
    ${desc ? `<div class="ev-desc">${desc}</div>` : ""}
    ${giveawayEntriesHtml(round.entries)}
    <div class="ev-cta" style="margin-top:16px">
      <a class="btn join" data-discord href="#" aria-label="Join Discord to enter">
        <svg fill="#1a1305" aria-hidden="true" style="width:16px;height:12px;vertical-align:-1px;margin-right:7px"><use href="#discord"/></svg>
        Enter on Discord
      </a>
    </div>
  </div>`;
}

function giveawayCard(round) {
  var effStatus = computeEventStatus(round);
  var d = new Date(round.startTime);
  var day = round.hasParsedDate ? d.getDate() : "DATE";
  var month = round.hasParsedDate ? d.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "TBA";
  var badge = eventStatusBadge(effStatus);
  var winnerText = round.winners && round.winners.length ? "Winner: " + esc(round.winners[0].name) : "";
  var statsText = round.totalEntries + " entries · " + round.totalParticipants + " players · " + formatGP(round.gpRaised) + " GP";

  return `<div class="ev-card">
    <div class="ev-card-date${round.hasParsedDate ? "" : " date-tba"}"><div class="d">${day}</div><div class="m">${esc(month)}</div></div>
    <div class="ev-card-info">
      <h3>${esc(cleanName(round.name))}</h3>
      <div class="ev-card-meta">${esc(round.prize)}</div>
      <div class="ga-card-stats">${statsText}</div>
      ${winnerText ? `<div class="ga-card-stats" style="color:var(--gold)">${winnerText}</div>` : ""}
    </div>
    ${badge}
  </div>`;
}

let _giveawayLoaded = false;

function renderGiveaways(rounds, { cached } = {}) {
  var featuredBody = document.getElementById("ga-featured-body");
  var pastBody = document.getElementById("ga-past-body");
  if (!featuredBody) return;

  var active = rounds.filter(function(r) { return computeEventStatus(r) !== "completed"; });
  var past = rounds.filter(function(r) { return computeEventStatus(r) === "completed"; });

  var featured = active[0];

  if (featuredBody) {
    featuredBody.innerHTML = featured
      ? featuredGiveawayHtml(featured)
      : '<p class="ev-empty">No active giveaways right now. Check Discord!</p>';
  }

  if (pastBody) {
    var pastRounds = featured ? past : past;
    pastBody.innerHTML = pastRounds.length
      ? pastRounds.map(giveawayCard).join("")
      : '<p class="ev-empty">No past giveaways yet.</p>';
  }

  var gaBadge = document.getElementById("ga-badge");
  if (gaBadge) {
    if (cached) { gaBadge.textContent = "sample"; }
    else { gaBadge.textContent = "⟳ from Discord"; }
  }

  var gaTab = document.querySelector('.ev-tab[data-tab="giveaways"]');
  if (gaTab) {
    var anyLive = rounds.some(function(r) { return computeEventStatus(r) === "live"; });
    gaTab.classList.toggle("ga-tab-live", anyLive);
  }

  wireDiscordLinks();
  startCountdownTimers();
}

async function loadGiveaway() {
  var featuredBody = document.getElementById("ga-featured-body");
  if (!featuredBody) return;
  try {
    var r = await fetch("/api/giveaway", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bad status " + r.status);
    var data = await r.json();
    if (!data || !data.configured || !Array.isArray(data.rounds) || !data.rounds.length) throw new Error("empty");
    renderGiveaways(data.rounds, { cached: false });
  } catch (e) {
    renderGiveaways(GIVEAWAY_FALLBACK, { cached: true });
  }
}

function wireGiveawayTabs() {
  var tabs = document.getElementById("ev-tabs");
  if (!tabs) return;
  tabs.querySelectorAll(".ev-tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      var target = tab.dataset.tab;
      tabs.querySelectorAll(".ev-tab").forEach(function(t) {
        t.classList.toggle("active", t.dataset.tab === target);
      });
      var evContent = document.getElementById("events-content");
      var gaContent = document.getElementById("giveaways-content");
      var heroTitle = document.getElementById("ev-hero-title");
      var heroTag = document.getElementById("ev-hero-tag");
      if (target === "giveaways") {
        if (evContent) evContent.style.display = "none";
        if (gaContent) gaContent.style.display = "";
        if (heroTitle) heroTitle.textContent = "Giveaways";
        if (heroTag) heroTag.textContent = "Win prizes, support the clan";
        if (!_giveawayLoaded) {
          _giveawayLoaded = true;
          loadGiveaway();
        }
      } else {
        if (evContent) evContent.style.display = "";
        if (gaContent) gaContent.style.display = "none";
        if (heroTitle) heroTitle.textContent = "Clan Events";
        if (heroTag) heroTag.textContent = "Live from Discord";
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDiscordLinks();
  wireNav();
  wireToasts();
  wireRosterControls();
  loadRoster();
  wireGallery();
  loadNews();
  loadEvents();
  loadAchievements();
  loadGallery();
  loadSpotlight();
  wireGiveawayTabs();
});

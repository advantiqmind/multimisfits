/* Bracket Knockout -- OSRS-themed elimination bracket drawing tool.
   Loads participants from /api/events and entries from /api/giveaway,
   cross-references /api/wom for clan ranks. Code-locked behind a
   passphrase stored in localStorage. */
(function () {
  "use strict";

  // -- Constants --
  var BASE_HP = 15, SHIELD_HP = 5, BONUS_HP = 1, MAX_HIT = 6;
  var BASE_HIT_DELAY = 450, POST_KO_DELAY = 400, ADVANCE_DELAY = 800;
  var COUNTDOWN_NUM_MS = 700, COUNTDOWN_FIGHT_MS = 550;
  var SPEED_MULTS = [2, 1.5, 1, 0.6, 0.3];

  // -- Splat images (drawn once on canvas, stored as data URIs) --
  var SPLAT_IMGS = {};

  function genSplats() {
    var defs = {
      hit: {
        pts: [[20,2],[27,11],[35,4],[32,15],[39,18],[33,24],[37,34],[28,31],[23,39],[17,32],[9,36],[13,26],[3,21],[13,17],[7,8],[16,13]],
        c1: "#ff3020", c2: "#901010"
      },
      max: {
        pts: [[20,1],[26,9],[34,2],[31,12],[39,11],[34,19],[40,25],[34,28],[38,37],[28,32],[25,40],[19,33],[12,38],[14,28],[4,28],[10,22],[1,15],[10,15],[6,5],[14,10]],
        c1: "#ff4828", c2: "#780808"
      },
      zero: {
        pts: [[20,3],[26,12],[34,7],[31,17],[38,22],[32,28],[35,36],[27,33],[21,39],[16,33],[9,36],[13,28],[4,23],[13,19],[8,10],[16,14]],
        c1: "#40a0f0", c2: "#0c4080"
      }
    };
    for (var key in defs) {
      var d = defs[key];
      var c = document.createElement("canvas");
      c.width = 42; c.height = 42;
      var ctx = c.getContext("2d");
      ctx.translate(1, 1);
      ctx.beginPath();
      ctx.moveTo(d.pts[0][0], d.pts[0][1]);
      for (var i = 1; i < d.pts.length; i++) ctx.lineTo(d.pts[i][0], d.pts[i][1]);
      ctx.closePath();
      var g = ctx.createRadialGradient(18, 16, 2, 20, 20, 19);
      g.addColorStop(0, d.c1);
      g.addColorStop(1, d.c2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      SPLAT_IMGS[key] = c.toDataURL();
    }
  }

  function createSplat(value) {
    var el = document.createElement("div");
    el.className = "bk-hit-splat " + (value >= MAX_HIT ? "max-hit" : value === 0 ? "zero" : "regular");
    el.style.backgroundImage = "url(" + SPLAT_IMGS[value >= MAX_HIT ? "max" : value === 0 ? "zero" : "hit"] + ")";
    el.textContent = value;
    return el;
  }

  // -- HP calc --
  function hpForEntries(e) {
    var shield = e >= 2 ? SHIELD_HP : 0;
    var bonus = e >= 3 ? Math.min(e - 2, 3) : 0;
    return { base: BASE_HP, shield: shield, bonus: bonus, total: BASE_HP + shield + bonus };
  }

  function rollHit() { return Math.floor(Math.random() * (MAX_HIT + 1)); }

  // -- Round naming --
  function roundName(totalRounds, roundIdx) {
    var remaining = totalRounds - roundIdx;
    if (remaining === 1) return "Final";
    if (remaining === 2) return "Semi Finals";
    if (remaining === 3) return "Quarter Finals";
    var size = Math.pow(2, remaining);
    return "Round of " + size;
  }

  // -- Shuffle --
  function shuffle(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  // -- State --
  var state = {
    round: 0, totalRounds: 0, bracket: [], running: false,
    speed: 3, done: false, roundStarted: false, matchIdx: 0,
    players: [], womMap: {}
  };
  var popoutWin = null;
  var eventsById = {};
  var giveawayRounds = [];
  var manualEntries = []; // {name, entries, rank}

  // -- Code lock --
  function checkLock() {
    try {
      if (localStorage.getItem("mm-bracket-unlocked") === "1") {
        showMain();
        return;
      }
    } catch (e) { /* storage blocked */ }
    showLock();
  }

  function showLock() {
    var lock = document.getElementById("bkLock");
    var main = document.getElementById("bkMain");
    if (lock) lock.hidden = false;
    if (main) main.hidden = true;
  }

  function showMain() {
    var lock = document.getElementById("bkLock");
    var main = document.getElementById("bkMain");
    if (lock) lock.hidden = true;
    if (main) main.hidden = false;
    init();
  }

  function handleCodeSubmit() {
    var input = document.getElementById("bkCodeInput");
    var err = document.getElementById("bkCodeError");
    if (!input) return;
    if (input.value === "Misfits") {
      try { localStorage.setItem("mm-bracket-unlocked", "1"); } catch (e) { /* */ }
      if (err) err.hidden = true;
      showMain();
    } else {
      if (err) err.hidden = false;
    }
  }

  // -- DOM setup for lock --
  function bindLockEvents() {
    var btn = document.getElementById("bkCodeSubmit");
    var input = document.getElementById("bkCodeInput");
    if (btn) btn.addEventListener("click", handleCodeSubmit);
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleCodeSubmit();
      });
    }
  }

  // -- Data loading --
  function fetchWOM() {
    return fetch("/api/wom", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.members)) return;
        for (var i = 0; i < data.members.length; i++) {
          var m = data.members[i];
          if (m.username && m.role) {
            state.womMap[m.username.toLowerCase()] = m.role;
          }
        }
      })
      .catch(function () { /* WOM unavailable, ranks just won't show */ });
  }

  function fetchEvents() {
    return fetch("/api/events", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.configured || !Array.isArray(data.events)) return [];
        var withParts = [];
        for (var i = 0; i < data.events.length; i++) {
          var ev = data.events[i];
          if (ev.participants && ev.participants.length) {
            eventsById[ev.id] = ev;
            withParts.push(ev);
          }
        }
        return withParts;
      })
      .catch(function () { return []; });
  }

  function fetchGiveaways() {
    return fetch("/api/giveaway", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.configured || !Array.isArray(data.rounds)) return [];
        giveawayRounds = data.rounds;
        return data.rounds;
      })
      .catch(function () { return []; });
  }

  function populateEventPicker(events, gaRounds) {
    var picker = document.getElementById("bkEventPicker");
    if (!picker) return;

    picker.innerHTML = '<option value="">Pick a source...</option>';

    if (events.length) {
      var evGroup = document.createElement("optgroup");
      evGroup.label = "Events";
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var opt = document.createElement("option");
        opt.value = "event:" + ev.id;
        opt.textContent = ev.name + " (" + ev.participants.length + " joined)";
        evGroup.appendChild(opt);
      }
      picker.appendChild(evGroup);
    }

    if (gaRounds.length) {
      var gaGroup = document.createElement("optgroup");
      gaGroup.label = "Giveaways";
      for (var j = 0; j < gaRounds.length; j++) {
        var round = gaRounds[j];
        if (!round.entries || !round.entries.length) continue;
        var opt2 = document.createElement("option");
        opt2.value = "giveaway:" + j;
        var total = 0;
        for (var k = 0; k < round.entries.length; k++) total += round.entries[k].count;
        opt2.textContent = round.name + " (" + total + " entries)";
        gaGroup.appendChild(opt2);
      }
      picker.appendChild(gaGroup);
    }

    // Deep link support
    var params = new URLSearchParams(window.location.search);
    var wantedEvent = params.get("event");
    var wantedGA = params.get("giveaway");

    if (wantedEvent && eventsById[wantedEvent]) {
      picker.value = "event:" + wantedEvent;
      loadFromPicker("event:" + wantedEvent);
      history.replaceState(null, "", window.location.pathname);
    } else if (wantedGA !== null) {
      var idx = parseInt(wantedGA, 10);
      if (!isNaN(idx) && idx >= 0 && idx < gaRounds.length) {
        picker.value = "giveaway:" + idx;
        loadFromPicker("giveaway:" + idx);
        history.replaceState(null, "", window.location.pathname);
      }
    }
  }

  function loadFromPicker(val) {
    if (!val) return;
    var parts = val.split(":");
    var type = parts[0];
    var id = parts.slice(1).join(":");
    var newEntries = [];

    if (type === "event" && eventsById[id]) {
      var ev = eventsById[id];
      for (var i = 0; i < ev.participants.length; i++) {
        var name = ev.participants[i];
        var role = state.womMap[name.toLowerCase()] || "";
        newEntries.push({ name: name, entries: 1, rank: role });
      }
    } else if (type === "giveaway") {
      var idx = parseInt(id, 10);
      if (isNaN(idx) || idx < 0 || idx >= giveawayRounds.length) return;
      var round = giveawayRounds[idx];
      if (!round.entries || !round.entries.length) return;
      for (var j = 0; j < round.entries.length; j++) {
        var e = round.entries[j];
        var role2 = state.womMap[e.player.toLowerCase()] || "";
        newEntries.push({ name: e.player, entries: e.count, rank: role2 });
      }
    }

    if (!newEntries.length) return;
    if (manualEntries.length && !window.confirm("Replace current fighters with loaded data?")) return;
    manualEntries = newEntries;
    renderEntries();
    applyEntriesToBracket();
  }

  // -- Manual entry management --
  function renderEntries() {
    var list = document.getElementById("bkEntryList");
    var countEl = document.getElementById("bkFighterCount");
    if (!list) return;
    var html = "";
    for (var i = 0; i < manualEntries.length; i++) {
      var e = manualEntries[i];
      var hp = hpForEntries(e.entries);
      html += '<div class="bk-entry">' +
        (e.rank ? '<span class="bk-rank-icon">' + rankMark(e.rank) + '</span>' : '') +
        '<span class="bk-entry-name">' + esc(e.name) + '</span>' +
        '<span class="bk-entry-controls">' +
          '<button class="bk-entry-adj minus" data-idx="' + i + '" data-delta="-1">−</button>' +
          '<span class="bk-entry-qty">' + e.entries + '</span>' +
          '<button class="bk-entry-adj plus" data-idx="' + i + '" data-delta="1">+</button>' +
        '</span>' +
        '<span class="bk-entry-hp">' + hp.total + ' HP</span>' +
        '<button class="bk-entry-remove" data-idx="' + i + '">×</button>' +
        '</div>';
    }
    list.innerHTML = html;
    if (countEl) countEl.textContent = manualEntries.length;
  }

  function addEntry(rawName, rawEntries) {
    var name = rawName.trim();
    if (!name) return;
    var count = Math.max(1, Math.min(5, parseInt(rawEntries, 10) || 1));
    var lower = name.toLowerCase();
    for (var i = 0; i < manualEntries.length; i++) {
      if (manualEntries[i].name.toLowerCase() === lower) {
        manualEntries[i].entries = Math.min(5, manualEntries[i].entries + count);
        renderEntries();
        applyEntriesToBracket();
        return;
      }
    }
    var role = state.womMap[lower] || "";
    manualEntries.push({ name: name, entries: count, rank: role });
    renderEntries();
    applyEntriesToBracket();
  }

  function adjustEntry(idx, delta) {
    if (idx < 0 || idx >= manualEntries.length) return;
    manualEntries[idx].entries = Math.max(1, Math.min(5, manualEntries[idx].entries + delta));
    renderEntries();
    applyEntriesToBracket();
  }

  function removeEntry(idx) {
    if (idx < 0 || idx >= manualEntries.length) return;
    manualEntries.splice(idx, 1);
    renderEntries();
    applyEntriesToBracket();
  }

  function clearEntries() {
    if (!manualEntries.length) return;
    manualEntries = [];
    renderEntries();
    applyEntriesToBracket();
  }

  function applyEntriesToBracket() {
    state.players = manualEntries.slice();
    initBracket();
  }

  // -- Bracket init --
  function initBracket() {
    if (!state.players.length) {
      document.getElementById("bkBracket").innerHTML = "";
      updateStatus();
      updateButton();
      return;
    }

    var shuffled = shuffle(state.players);

    // Pad to next power of 2
    var n = shuffled.length;
    var size = 1;
    while (size < n) size *= 2;

    var slots = [];
    for (var i = 0; i < size; i++) {
      if (i < shuffled.length) {
        var p = shuffled[i];
        slots.push({
          name: p.name, entries: p.entries, rank: p.rank,
          eliminated: false, advancing: false, winner: false, fighting: false,
          seed: i + 1
        });
      } else {
        slots.push(null); // bye
      }
    }

    state.bracket = [];
    state.round = 0;
    state.running = false;
    state.done = false;
    state.roundStarted = false;
    state.matchIdx = 0;

    var rp = slots;
    var nr = 0;
    while (rp.length > 1) {
      var ms = [];
      for (var j = 0; j < rp.length; j += 2) {
        ms.push({ p1: rp[j], p2: rp[j + 1] || null, winner: null, resolved: false });
      }
      state.bracket.push(ms);
      rp = ms.map(function () {
        return { name: "???", entries: 0, eliminated: false, advancing: false, placeholder: true, fighting: false };
      });
      nr++;
    }
    state.bracket.push([{ champion: true, player: null }]);
    state.totalRounds = nr;

    document.getElementById("bkOverlay").hidden = true;
    updateButton();
    renderBracket();
    updateStatus();
    popoutSend("reset", getStandings());
  }

  // -- UI updates --
  function updateButton() {
    var b = document.getElementById("bkStartBtn");
    if (!b) return;
    if (state.done) { b.textContent = "Complete!"; b.disabled = true; }
    else if (state.running) { b.textContent = "Fighting..."; b.disabled = true; }
    else if (!state.roundStarted) { b.textContent = "Start Round"; b.disabled = !state.players.length; }
    else { b.textContent = "Start Fight"; b.disabled = false; }
  }

  function updateStatus() {
    var allPlayers = [];
    if (state.bracket.length > 0 && !state.bracket[0][0].champion) {
      for (var i = 0; i < state.bracket[0].length; i++) {
        var m = state.bracket[0][i];
        if (m.p1) allPlayers.push(m.p1);
        if (m.p2) allPlayers.push(m.p2);
      }
    }

    var remain = 0, elim = 0;
    for (var j = 0; j < allPlayers.length; j++) {
      if (allPlayers[j].eliminated) elim++;
      else remain++;
    }

    var remainEl = document.getElementById("bkRemainCount");
    var elimEl = document.getElementById("bkElimCount");
    if (remainEl) remainEl.textContent = remain;
    if (elimEl) elimEl.textContent = elim;

    // Round dots
    var dotContainer = document.getElementById("bkRoundDots");
    if (dotContainer) {
      dotContainer.innerHTML = "";
      for (var k = 0; k < state.totalRounds; k++) {
        var dot = document.createElement("div");
        dot.className = "bk-round-dot" + (k < state.round ? " done" : k === state.round ? " active" : "");
        dotContainer.appendChild(dot);
      }
    }

    var rnLabel = document.getElementById("bkRoundNameLabel");
    if (rnLabel) {
      rnLabel.textContent = state.done ? "Complete" : (state.totalRounds > 0 ? roundName(state.totalRounds, state.round) : "");
    }
  }

  function renderBracket() {
    var el = document.getElementById("bkBracket");
    if (!el) return;
    el.innerHTML = "";

    for (var ri = 0; ri < state.bracket.length; ri++) {
      var round = state.bracket[ri];

      // Champion area
      if (ri === state.bracket.length - 1) {
        var cd = document.createElement("div");
        cd.className = "bk-champion-area";
        var cp = round[0].player;
        var rev = cp && !cp.placeholder;
        cd.innerHTML =
          '<div class="bk-champion-card' + (rev ? " revealed" : "") + '">' +
            '<div class="bk-trophy' + (rev ? " revealed" : "") + '">\u{1F3C6}</div>' +
            '<div class="bk-champion-label">Champion</div>' +
            '<div class="bk-champion-name">' + (rev ? esc(cp.name) : "") + '</div>' +
          '</div>';
        el.appendChild(cd);
        continue;
      }

      var rd = document.createElement("div");
      rd.className = "bk-round";
      rd.innerHTML = '<div class="bk-round-title">' + esc(roundName(state.totalRounds, ri)) + '</div>';

      for (var mi = 0; mi < round.length; mi++) {
        var m = round[mi];
        var md = document.createElement("div");
        md.className = "bk-matchup";

        var sides = [m.p1, m.p2];
        for (var si = 0; si < sides.length; si++) {
          var p = sides[si];
          if (!p) {
            // Bye slot
            var byeCard = document.createElement("div");
            byeCard.className = "bk-player-card bk-empty";
            byeCard.innerHTML = '<span class="bk-player-name">BYE</span>';
            md.appendChild(byeCard);
            continue;
          }

          var card = document.createElement("div");
          var cls = "bk-player-card";
          if (p.placeholder) cls += " bk-empty";
          if (p.fighting) cls += " bk-fighting";
          if (p.eliminated) cls += " bk-eliminated";
          if (p.advancing) cls += " bk-advancing";
          if (p.winner) cls += " bk-winner";
          card.className = cls;

          if (!p.placeholder && p.seed) {
            var seedEl = document.createElement("span");
            seedEl.className = "bk-player-seed";
            seedEl.textContent = p.seed;
            card.appendChild(seedEl);
          }

          // Rank icon
          if (!p.placeholder && p.rank) {
            var rankSpan = document.createElement("span");
            rankSpan.className = "bk-rank-icon";
            rankSpan.innerHTML = rankMark(p.rank);
            card.appendChild(rankSpan);
          }

          var nameSpan = document.createElement("span");
          nameSpan.className = "bk-player-name";
          nameSpan.textContent = p.placeholder ? "TBD" : p.name;
          card.appendChild(nameSpan);

          if (!p.placeholder && p.entries) {
            var badge = document.createElement("span");
            badge.className = "bk-entry-badge";
            badge.textContent = hpForEntries(p.entries).total + " HP";
            card.appendChild(badge);
          }

          md.appendChild(card);
        }

        md.innerHTML += '<div class="bk-connector"></div>';
        rd.appendChild(md);
      }

      el.appendChild(rd);
    }
  }

  // -- Timing --
  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms * (SPEED_MULTS[state.speed - 1] || 1));
    });
  }

  function fixedWait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // -- HP chunks --
  function buildHPChunks(container, hpData, currentHP) {
    container.innerHTML = "";
    var row = document.createElement("div");
    row.className = "bk-hp-chunks";
    row.id = container.id + "-chunks";
    var idx = 0;

    for (var i = 0; i < hpData.base; i++, idx++) {
      var c = document.createElement("div");
      c.className = "bk-hp-chunk base" + (idx >= currentHP ? " dead" : "");
      row.appendChild(c);
    }
    if (hpData.shield > 0) {
      var gap1 = document.createElement("div");
      gap1.className = "bk-hp-chunk-gap";
      row.appendChild(gap1);
      for (var s = 0; s < hpData.shield; s++, idx++) {
        var cs = document.createElement("div");
        cs.className = "bk-hp-chunk shield" + (idx >= currentHP ? " dead" : "");
        row.appendChild(cs);
      }
    }
    if (hpData.bonus > 0) {
      var gap2 = document.createElement("div");
      gap2.className = "bk-hp-chunk-gap";
      row.appendChild(gap2);
      for (var b = 0; b < hpData.bonus; b++, idx++) {
        var cb = document.createElement("div");
        cb.className = "bk-hp-chunk bonus" + (idx >= currentHP ? " dead" : "");
        row.appendChild(cb);
      }
    }
    container.appendChild(row);
  }

  function updateHPChunks(id, hpData, hp) {
    var row = document.getElementById(id + "-chunks");
    if (!row) return;
    var idx = 0;
    for (var i = 0; i < row.children.length; i++) {
      var ch = row.children[i];
      if (ch.classList.contains("bk-hp-chunk-gap")) continue;
      if (idx >= hp) ch.classList.add("dead");
      else ch.classList.remove("dead");
      idx++;
    }
  }

  // -- Fight UI --
  function buildFightUI(p1, p2, fightIdx, totalFights) {
    document.getElementById("bkFightRoundLabel").textContent = roundName(state.totalRounds, state.round);
    document.getElementById("bkFightMatchLabel").textContent = "Match " + (fightIdx + 1) + " of " + totalFights;
    var logEl = document.getElementById("bkFightLog");
    logEl.textContent = "";
    logEl.className = "bk-fight-log";
    var arena = document.getElementById("bkArena");
    arena.innerHTML = "";

    function makeFighter(p, side) {
      var f = document.createElement("div");
      f.className = "bk-fighter";
      var h = hpForEntries(p.entries);

      var ind = document.createElement("div");
      ind.className = "bk-fight-indicator";
      ind.id = "bkInd-" + side;
      f.appendChild(ind);

      var nameDiv = document.createElement("div");
      nameDiv.className = "bk-fighter-name";
      nameDiv.textContent = p.name;
      f.appendChild(nameDiv);

      var entDiv = document.createElement("div");
      entDiv.className = "bk-fighter-entries";
      entDiv.textContent = p.entries + (p.entries === 1 ? " entry" : " entries");
      f.appendChild(entDiv);

      var wrap = document.createElement("div");
      wrap.className = "bk-hp-chunks-wrap";

      var hpC = document.createElement("div");
      hpC.id = "bkHp-" + side;
      wrap.appendChild(hpC);

      var leg = document.createElement("div");
      leg.className = "bk-hp-legend";
      leg.innerHTML = '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch base"></span>' + h.base + ' HP</span>';
      if (h.shield > 0) leg.innerHTML += '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch shield"></span>+' + h.shield + ' Shield</span>';
      if (h.bonus > 0) leg.innerHTML += '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch bonus"></span>+' + h.bonus + ' Bonus</span>';
      wrap.appendChild(leg);

      f.appendChild(wrap);

      var sp = document.createElement("div");
      sp.className = "bk-splat-area";
      sp.id = "bkSplats-" + side;
      f.appendChild(sp);

      return f;
    }

    var vs = document.createElement("div");
    vs.className = "bk-vs-divider";
    vs.textContent = "VS";
    arena.appendChild(makeFighter(p1, "left"));
    arena.appendChild(vs);
    arena.appendChild(makeFighter(p2, "right"));
  }

  // -- Countdown --
  async function showCountdown() {
    var panel = document.getElementById("bkFightPanel");
    var wrap = document.createElement("div");
    wrap.className = "bk-countdown-wrap";
    wrap.id = "bkCountdown";
    panel.appendChild(wrap);
    popoutSend("countdown-start", null);
    var nums = ["3", "2", "1"];
    for (var i = 0; i < nums.length; i++) {
      wrap.innerHTML = '<div class="bk-countdown-num">' + nums[i] + '</div>';
      popoutSend("countdown", nums[i]);
      await fixedWait(COUNTDOWN_NUM_MS);
    }
    wrap.innerHTML = '<div class="bk-countdown-fight">FIGHT!</div>';
    popoutSend("countdown", "FIGHT!");
    await fixedWait(COUNTDOWN_FIGHT_MS);
    wrap.remove();
    popoutSend("countdown-end", null);
  }

  var ICON_SWORD = '<span class="bk-icon-sword">⚔️</span>';
  var ICON_SHIELD = '<span class="bk-icon-shield">🛡️</span>';
  var ICON_TROPHY = '<span class="bk-icon-trophy">🏆</span>';

  function setIndicators(atkSide) {
    var left = document.getElementById("bkInd-left");
    var right = document.getElementById("bkInd-right");
    if (!left || !right) return;
    if (atkSide === "left") {
      left.innerHTML = ICON_SWORD;
      left.className = "bk-fight-indicator bk-ind-atk";
      right.innerHTML = ICON_SHIELD;
      right.className = "bk-fight-indicator bk-ind-def";
    } else {
      right.innerHTML = ICON_SWORD;
      right.className = "bk-fight-indicator bk-ind-atk";
      left.innerHTML = ICON_SHIELD;
      left.className = "bk-fight-indicator bk-ind-def";
    }
  }

  function setTrophy(side) {
    var el = document.getElementById("bkInd-" + side);
    var other = document.getElementById("bkInd-" + (side === "left" ? "right" : "left"));
    if (el) { el.innerHTML = ICON_TROPHY; el.className = "bk-fight-indicator bk-ind-trophy"; }
    if (other) { other.innerHTML = ""; other.className = "bk-fight-indicator"; }
  }

  // -- Fight animation --
  async function animateFight(p1, p2) {
    var h1 = hpForEntries(p1.entries), h2 = hpForEntries(p2.entries);
    var hp1 = h1.total, hp2 = h2.total;
    buildHPChunks(document.getElementById("bkHp-left"), h1, hp1);
    buildHPChunks(document.getElementById("bkHp-right"), h2, hp2);
    popoutSend("fight-start", {
      f1: { name: p1.name, entries: p1.entries, hp: hp1, hpData: h1 },
      f2: { name: p2.name, entries: p2.entries, hp: hp2, hpData: h2 }
    });

    var s1 = document.getElementById("bkSplats-left");
    var s2 = document.getElementById("bkSplats-right");
    var log = document.getElementById("bkFightLog");
    var panel = document.getElementById("bkFightPanel");

    await showCountdown();
    await wait(200);

    var turn = 0;
    while (hp1 > 0 && hp2 > 0) {
      var hit = rollHit();
      var atk = turn % 2 === 0 ? p1.name : p2.name;
      var def = turn % 2 === 0 ? p2.name : p1.name;
      setIndicators(turn % 2 === 0 ? "left" : "right");

      if (turn % 2 === 0) {
        hp2 = Math.max(0, hp2 - hit);
        s2.appendChild(createSplat(hit));
        updateHPChunks("bkHp-right", h2, hp2);
      } else {
        hp1 = Math.max(0, hp1 - hit);
        s1.appendChild(createSplat(hit));
        updateHPChunks("bkHp-left", h1, hp1);
      }

      if (hit >= MAX_HIT) {
        panel.classList.add("shake");
        setTimeout(function () { panel.classList.remove("shake"); }, 250);
        log.className = "bk-fight-log";
        log.textContent = atk + " smashes " + def + " for " + hit + "!";
      } else if (hit === 0) {
        log.className = "bk-fight-log";
        log.textContent = atk + " splashes on " + def + "!";
      } else {
        log.className = "bk-fight-log";
        log.textContent = atk + " hits " + hit + " on " + def;
      }

      popoutSend("hit", {
        side: turn % 2 === 0 ? "right" : "left",
        value: hit, hp1: hp1, hp2: hp2,
        log: log.textContent,
        isMax: hit >= MAX_HIT
      });
      turn++;
      await wait(BASE_HIT_DELAY);
    }
    await wait(POST_KO_DELAY);

    var w = hp1 > 0;
    var wn = w ? p1.name : p2.name;
    var ln = w ? p2.name : p1.name;
    log.className = "bk-fight-log ko";
    log.textContent = ln + " has been defeated!";
    setTrophy(w ? "left" : "right");
    popoutSend("ko", { loser: ln, log: log.textContent });
    await wait(700);
    log.className = "bk-fight-log win";
    log.textContent = wn + " advances!";
    popoutSend("advance", { winner: wn, log: log.textContent });
    await wait(ADVANCE_DELAY);
    return w ? { winner: p1, loser: p2 } : { winner: p2, loser: p1 };
  }

  // -- Bye resolution --
  function resolveBye(matchup, mi) {
    var ri = state.round;
    var nr = state.bracket[ri + 1];
    matchup.winner = matchup.p1;
    matchup.p1.advancing = true;
    matchup.resolved = true;
    if (ri < state.totalRounds - 1) {
      var ni = Math.floor(mi / 2);
      if (nr[ni]) nr[ni][mi % 2 === 0 ? "p1" : "p2"] = matchup.p1;
    } else {
      nr[0].player = matchup.p1;
    }
    renderBracket();
  }

  // -- Start round / fight --
  function startRound() {
    if (state.running || state.done || state.round >= state.totalRounds) return;
    state.roundStarted = true;
    state.matchIdx = 0;

    document.getElementById("bkOverlay").hidden = false;
    var arena = document.getElementById("bkArena");
    arena.innerHTML = "";
    var logEl = document.getElementById("bkFightLog");
    logEl.textContent = "";
    document.getElementById("bkFightRoundLabel").textContent = roundName(state.totalRounds, state.round);
    document.getElementById("bkFightMatchLabel").textContent = "";

    var round = state.bracket[state.round];

    // Skip byes
    while (state.matchIdx < round.length && (!round[state.matchIdx].p2 || round[state.matchIdx].resolved)) {
      var m = round[state.matchIdx];
      if (!m.resolved && !m.p2) resolveBye(m, state.matchIdx);
      state.matchIdx++;
    }

    var nextMatch = round[state.matchIdx];
    if (nextMatch && nextMatch.p1 && nextMatch.p2) {
      var tf = 0;
      for (var i = 0; i < round.length; i++) {
        if (round[i].p1 && round[i].p2) tf++;
      }
      document.getElementById("bkFightMatchLabel").textContent = "Match 1 of " + tf;
      arena.innerHTML =
        '<div style="text-align:center;width:100%;padding:20px 0;">' +
          '<div style="font-family:Cinzel,serif;font-size:22px;color:var(--text);margin-bottom:8px;">' +
            esc(nextMatch.p1.name) +
            ' <span style="color:var(--gold);font-size:16px;margin:0 10px;">VS</span> ' +
            esc(nextMatch.p2.name) +
          '</div>' +
          '<button id="bkFightGo" class="btn join bk-btn-start" style="margin-top:18px;font-size:13px;padding:10px 32px;">Start Fight</button>' +
        '</div>';
      var goBtn = document.getElementById("bkFightGo");
      if (goBtn) goBtn.addEventListener("click", function () { runFight(); });
    }

    popoutSend("round-start", { roundName: roundName(state.totalRounds, state.round), standings: getStandings() });
    updateButton();
  }

  async function runFight() {
    if (state.running || state.done || !state.roundStarted) return;
    var ri = state.round;
    var round = state.bracket[ri];
    var nr = state.bracket[ri + 1];

    if (state.matchIdx >= round.length) { finishRound(); return; }
    var m = round[state.matchIdx];
    if (m.resolved || !m.p2) {
      state.matchIdx++;
      if (state.matchIdx >= round.length) { finishRound(); return; }
      runFight();
      return;
    }

    state.running = true;
    updateButton();
    m.p1.fighting = true;
    m.p2.fighting = true;
    renderBracket();

    var tf = 0, fn = 0;
    for (var i = 0; i < round.length; i++) {
      if (round[i].p1 && round[i].p2) {
        tf++;
        if (i < state.matchIdx) fn++;
      }
    }

    buildFightUI(m.p1, m.p2, fn, tf);
    await wait(200);

    var res = await animateFight(m.p1, m.p2);
    res.loser.eliminated = true;
    res.loser.fighting = false;
    res.winner.advancing = true;
    res.winner.fighting = false;
    m.winner = res.winner;
    m.resolved = true;

    var mi = state.matchIdx;
    if (ri < state.totalRounds - 1) {
      var ni = Math.floor(mi / 2);
      if (nr[ni]) nr[ni][mi % 2 === 0 ? "p1" : "p2"] = res.winner;
    } else {
      nr[0].player = res.winner;
    }
    renderBracket();
    updateStatus();
    state.matchIdx++;
    state.running = false;

    // Skip byes for remaining
    while (state.matchIdx < round.length && (!round[state.matchIdx].p2 || round[state.matchIdx].resolved)) {
      var x = round[state.matchIdx];
      if (!x.resolved && !x.p2) resolveBye(x, state.matchIdx);
      state.matchIdx++;
    }

    popoutSend("standings", getStandings());
    if (state.matchIdx >= round.length) finishRound();
    else {
      updateButton();
      var logEl = document.getElementById("bkFightLog");
      if (logEl) {
        var nb = document.createElement("button");
        nb.className = "btn join bk-btn-start";
        nb.style.cssText = "margin-top:12px;font-size:13px;padding:8px 28px;display:block;margin-left:auto;margin-right:auto;";
        nb.textContent = "Next Fight";
        nb.addEventListener("click", function () { runFight(); });
        logEl.appendChild(nb);
      }
    }
  }

  async function finishRound() {
    document.getElementById("bkOverlay").hidden = true;
    state.roundStarted = false;
    state.matchIdx = 0;
    state.round++;

    if (state.round >= state.totalRounds) {
      var cr = state.bracket[state.bracket.length - 1][0];
      if (cr.player) {
        cr.player.advancing = false;
        cr.player.winner = true;
        state.done = true;
        renderBracket();
        popoutSend("champion", cr.player.name);
        spawnSparkles(50);
        await wait(300);
        spawnSparkles(40);
        await wait(300);
        spawnSparkles(30);
      }
    }

    updateButton();
    updateStatus();
    popoutSend("round-end", getStandings());
  }

  // -- Sparkles --
  function spawnSparkles(n) {
    var c = document.getElementById("bkSparkles");
    if (!c) return;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("div");
      s.className = "bk-sparkle";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = 30 + Math.random() * 50 + "%";
      s.style.animationDelay = Math.random() * 0.5 + "s";
      s.style.width = s.style.height = (2 + Math.random() * 4) + "px";
      c.appendChild(s);
      setTimeout(function (el) { el.remove(); }, 2000, s);
    }
  }

  // -- Standings --
  function getStandings() {
    var result = [];
    if (!state.bracket.length || state.bracket[0][0].champion) return result;
    for (var i = 0; i < state.bracket[0].length; i++) {
      var m = state.bracket[0][i];
      var sides = [m.p1, m.p2];
      for (var j = 0; j < sides.length; j++) {
        var p = sides[j];
        if (!p) continue;
        result.push({
          name: p.name,
          entries: p.entries,
          status: p.winner ? "champion" : p.eliminated ? "eliminated" : p.advancing ? "advancing" : "alive"
        });
      }
    }
    return result;
  }

  // -- Popout --
  function popoutSend(type, data) {
    if (!popoutWin || popoutWin.closed) return;
    try { if (popoutWin.receive) popoutWin.receive(type, data); } catch (e) { /* cross-origin */ }
  }

  function openPopout() {
    if (popoutWin && !popoutWin.closed) { popoutWin.focus(); return; }
    popoutWin = window.open("", "bk-stream", "width=860,height=640,toolbar=no,menubar=no");
    if (!popoutWin) return;

    var splatCSS = "";
    for (var k in SPLAT_IMGS) {
      splatCSS += ".splat-" + k + "{background-image:url(" + SPLAT_IMGS[k] + ")}\n";
    }

    popoutWin.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>Bracket Knockout - Stream</title>' +
'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Jersey+15&display=swap">' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{background:#15100d;color:#f2ead8;font-family:"Jersey 15",system-ui,sans-serif;overflow:hidden;height:100vh;display:flex;flex-direction:column}' +
'.stream-header{background:#1e1812;border-bottom:2px solid #4a3d30;padding:10px 20px;text-align:center}' +
'.stream-title{font-family:"Cinzel",serif;font-weight:900;font-size:18px;color:#e0b84a;letter-spacing:3px;text-transform:uppercase}' +
'.stream-round{font-family:"Cinzel",serif;font-size:14px;color:#e0b84a;letter-spacing:2px;text-transform:uppercase;margin-top:4px}' +
'.stream-match{font-size:12px;color:#c8b898;font-family:"Cinzel",serif;letter-spacing:1px;text-transform:uppercase;margin-top:2px}' +
'.fight-area{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;position:relative;min-height:0}' +
'.s-arena{display:flex;align-items:flex-start;justify-content:center;gap:20px;width:100%;max-width:760px}' +
'.s-fighter{flex:1;max-width:300px;display:flex;flex-direction:column;align-items:center;gap:5px}' +
'.s-fighter-name{font-size:22px;color:#f2ead8}' +
'.s-fighter-entries{font-size:12px;color:#c8b898}' +
'.s-hp-chunks{display:flex;gap:2px;justify-content:center;flex-wrap:wrap}' +
'.s-hp-chunk{width:11px;height:20px;border-radius:2px;border:1.5px solid}' +
'.s-hp-chunk.base{background:#d42020;border-color:#881414}' +
'.s-hp-chunk.shield{background:#3090d4;border-color:#185888}' +
'.s-hp-chunk.bonus{background:#30c868;border-color:#147838}' +
'.s-hp-chunk.dead{background:#1e1a14;border-color:#302820;opacity:.45}' +
'.s-hp-gap{width:5px;flex-shrink:0}' +
'.s-hp-legend{display:flex;gap:8px;justify-content:center;font-size:10px;color:#c8b898;margin-top:3px}' +
'.s-legend-sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:2px;vertical-align:middle}' +
'.s-legend-sw.base{background:#d42020}.s-legend-sw.shield{background:#3090d4}.s-legend-sw.bonus{background:#30c868}' +
'.s-splats{min-height:50px;display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;padding:3px 0}' +
'.s-splat{display:inline-flex;align-items:center;justify-content:center;background-size:contain;background-repeat:no-repeat;background-position:center;font-family:"Jersey 15",system-ui;font-weight:bold;color:white;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 2px 3px rgba(0,0,0,.5);animation:sp .3s ease-out}' +
'.s-splat.regular{width:40px;height:40px;font-size:20px}' +
'.s-splat.max-hit{width:50px;height:50px;font-size:26px;filter:drop-shadow(0 0 8px rgba(255,30,30,.5));animation:mp .4s ease-out}' +
'.s-splat.zero{width:40px;height:40px;font-size:20px}' +
splatCSS +
'.s-vs{font-family:"Cinzel",serif;font-weight:900;font-size:18px;color:#e0b84a;padding-top:26px;flex-shrink:0}' +
'.s-log{font-size:15px;color:#c8b898;text-align:center;min-height:22px;margin-top:8px}' +
'.s-log.ko{color:#d44030;font-size:20px;font-family:"Cinzel",serif;font-weight:700}' +
'.s-log.win{color:#40d880;font-size:20px;font-family:"Cinzel",serif;font-weight:700}' +
'.standings{background:#1e1812;border-top:2px solid #4a3d30;padding:10px 20px;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;max-height:120px;overflow-y:auto}' +
'.s-player{font-size:13px;padding:3px 8px;border-radius:3px;border:1px solid #4a3d30;background:#2c231a;color:#f2ead8}' +
'.s-player.eliminated{color:#605848;text-decoration:line-through;text-decoration-color:#d44030;border-color:transparent;background:#1a1613}' +
'.s-player.advancing{border-color:#20a858;color:#40d880}' +
'.s-player.champion{border-color:#e0b84a;color:#ffd700;background:#3a3020;font-weight:bold}' +
'.s-countdown{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;background:rgba(8,6,4,.5)}' +
'.s-countdown[hidden]{display:none!important}' +
'.s-cd-num{font-family:"Cinzel",serif;font-weight:900;font-size:72px;color:#e0b84a;text-shadow:0 0 40px rgba(212,168,67,.5)}' +
'.s-cd-fight{font-family:"Cinzel",serif;font-weight:900;font-size:50px;color:#d44030;letter-spacing:5px;text-shadow:0 0 30px rgba(220,50,30,.5)}' +
'.s-champ-banner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:15;background:rgba(8,6,4,.85)}' +
'.s-champ-banner[hidden]{display:none!important}' +
'.s-champ-trophy{font-size:60px;filter:drop-shadow(0 0 20px rgba(255,215,0,.6));margin-bottom:12px}' +
'.s-champ-label{font-family:"Cinzel",serif;font-weight:900;font-size:14px;letter-spacing:4px;color:#b89530;text-transform:uppercase}' +
'.s-champ-name{font-family:"Cinzel",serif;font-weight:900;font-size:36px;color:#ffd700;text-shadow:0 0 30px rgba(255,215,0,.4);margin-top:8px}' +
'.s-idle{color:#a09080;font-family:"Cinzel",serif;font-size:14px;letter-spacing:2px;text-transform:uppercase}' +
'@keyframes sp{0%{transform:scale(0) rotate(-20deg);opacity:0}50%{transform:scale(1.2) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}' +
'@keyframes mp{0%{transform:scale(0) rotate(-30deg);opacity:0}40%{transform:scale(1.4) rotate(6deg);opacity:1}70%{transform:scale(.95) rotate(-2deg)}100%{transform:scale(1) rotate(0);opacity:1}}' +
'.shake{animation:sk .2s ease-out}' +
'@keyframes sk{0%{transform:translate(0)}20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-2px,1px)}100%{transform:translate(0)}}' +
'</style></head><body>' +
'<div class="stream-header">' +
'  <div class="stream-title">Bracket Knockout</div>' +
'  <div class="stream-round" id="sRound"></div>' +
'  <div class="stream-match" id="sMatch"></div>' +
'</div>' +
'<div class="fight-area" id="sFightArea">' +
'  <div class="s-arena" id="sArena"><div class="s-idle">Waiting for round to start...</div></div>' +
'  <div class="s-log" id="sLog"></div>' +
'  <div class="s-countdown" id="sCountdown" hidden></div>' +
'  <div class="s-champ-banner" id="sChamp" hidden></div>' +
'</div>' +
'<div class="standings" id="sStandings"></div>' +
'<script>' +
'function buildChunks(container,hpData,hp){' +
'container.innerHTML="";var idx=0;' +
'for(var i=0;i<hpData.base;i++,idx++){var c=document.createElement("div");c.className="s-hp-chunk base"+(idx>=hp?" dead":"");container.appendChild(c);}' +
'if(hpData.shield>0){container.appendChild(Object.assign(document.createElement("div"),{className:"s-hp-gap"}));for(var s=0;s<hpData.shield;s++,idx++){var cs=document.createElement("div");cs.className="s-hp-chunk shield"+(idx>=hp?" dead":"");container.appendChild(cs);}}' +
'if(hpData.bonus>0){container.appendChild(Object.assign(document.createElement("div"),{className:"s-hp-gap"}));for(var b=0;b<hpData.bonus;b++,idx++){var cb=document.createElement("div");cb.className="s-hp-chunk bonus"+(idx>=hp?" dead":"");container.appendChild(cb);}}' +
'}' +
'function updateChunks(id,hpData,hp){var r=document.getElementById(id);if(!r)return;var idx=0;for(var i=0;i<r.children.length;i++){var c=r.children[i];if(c.classList.contains("s-hp-gap"))continue;if(idx>=hp)c.classList.add("dead");else c.classList.remove("dead");idx++;}}' +
'function renderStandings(list){' +
'var el=document.getElementById("sStandings");el.innerHTML="";' +
'for(var i=0;i<list.length;i++){var p=list[i];var d=document.createElement("div");d.className="s-player "+p.status;d.textContent=p.name;el.appendChild(d);}' +
'}' +
'var curF1=null,curF2=null;' +
'window.receive=function(type,data){' +
'var sRound=document.getElementById("sRound"),sMatch=document.getElementById("sMatch"),sArena=document.getElementById("sArena"),sLog=document.getElementById("sLog"),sCD=document.getElementById("sCountdown"),sChamp=document.getElementById("sChamp"),sFA=document.getElementById("sFightArea");' +
'switch(type){' +
'case "reset":sRound.textContent="";sMatch.textContent="";sArena.innerHTML=\'<div class="s-idle">Waiting for round to start...</div>\';sLog.textContent="";sLog.className="s-log";sCD.hidden=true;sChamp.hidden=true;if(data)renderStandings(data);break;' +
'case "round-start":sRound.textContent=data.roundName;sChamp.hidden=true;if(data.standings)renderStandings(data.standings);break;' +
'case "fight-start":' +
'curF1=data.f1;curF2=data.f2;sArena.innerHTML="";' +
'function mkF(f,side){var d=document.createElement("div");d.className="s-fighter";' +
'd.innerHTML=\'<div class="s-fighter-name">\'+f.name+\'</div><div class="s-fighter-entries">\'+f.entries+(f.entries===1?" entry":" entries")+\'</div>\';' +
'var chunks=document.createElement("div");chunks.className="s-hp-chunks";chunks.id="sc-"+side;buildChunks(chunks,f.hpData,f.hp);d.appendChild(chunks);' +
'var leg=document.createElement("div");leg.className="s-hp-legend";' +
'leg.innerHTML=\'<span><span class="s-legend-sw base"></span>\'+f.hpData.base+\'</span>\';' +
'if(f.hpData.shield>0)leg.innerHTML+=\'<span><span class="s-legend-sw shield"></span>+\'+f.hpData.shield+\'</span>\';' +
'if(f.hpData.bonus>0)leg.innerHTML+=\'<span><span class="s-legend-sw bonus"></span>+\'+f.hpData.bonus+\'</span>\';' +
'd.appendChild(leg);' +
'var sp=document.createElement("div");sp.className="s-splats";sp.id="ss-"+side;d.appendChild(sp);return d;}' +
'var vs=document.createElement("div");vs.className="s-vs";vs.textContent="VS";' +
'sArena.appendChild(mkF(data.f1,"left"));sArena.appendChild(vs);sArena.appendChild(mkF(data.f2,"right"));' +
'sLog.textContent="";sLog.className="s-log";break;' +
'case "countdown-start":sCD.hidden=false;break;' +
'case "countdown":if(data==="FIGHT!")sCD.innerHTML=\'<div class="s-cd-fight">\'+data+\'</div>\';else sCD.innerHTML=\'<div class="s-cd-num">\'+data+\'</div>\';break;' +
'case "countdown-end":sCD.hidden=true;break;' +
'case "hit":' +
'var sp=document.createElement("div");sp.className="s-splat "+(data.value>=6?"max-hit":data.value===0?"zero":"regular")+" splat-"+(data.value>=6?"max":data.value===0?"zero":"hit");' +
'sp.textContent=data.value;var cont=document.getElementById("ss-"+data.side);if(cont)cont.appendChild(sp);' +
'if(data.side==="left")updateChunks("sc-left",curF1.hpData,data.hp1);else updateChunks("sc-right",curF2.hpData,data.hp2);' +
'sLog.className="s-log";sLog.textContent=data.log;' +
'if(data.isMax){sFA.classList.add("shake");setTimeout(function(){sFA.classList.remove("shake");},250);}break;' +
'case "ko":sLog.className="s-log ko";sLog.textContent=data.log;break;' +
'case "advance":sLog.className="s-log win";sLog.textContent=data.log;break;' +
'case "standings":renderStandings(data);break;' +
'case "round-end":if(data)renderStandings(data);sMatch.textContent="";break;' +
'case "champion":sChamp.hidden=false;sChamp.innerHTML=\'<div class="s-champ-trophy">\\u{1F3C6}</div><div class="s-champ-label">Champion</div><div class="s-champ-name">\'+data+\'</div>\';renderStandings([{name:data,status:"champion"}]);break;' +
'}};' +
'<\/script></body></html>');

    popoutWin.document.close();
    popoutSend("reset", getStandings());
  }

  // -- Event listeners --
  function bindEvents() {
    var startBtn = document.getElementById("bkStartBtn");
    var resetBtn = document.getElementById("bkResetBtn");
    var speedSlider = document.getElementById("bkSpeedSlider");
    var popoutBtn = document.getElementById("bkPopoutBtn");
    var picker = document.getElementById("bkEventPicker");
    var overlayClose = document.getElementById("bkOverlayClose");

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (state.running) return;
        if (!state.roundStarted) startRound();
        else runFight();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state.running = false;
        if (state.players.length) initBracket();
      });
    }

    if (speedSlider) {
      speedSlider.addEventListener("input", function (e) {
        state.speed = parseInt(e.target.value, 10);
      });
    }

    if (popoutBtn) {
      popoutBtn.addEventListener("click", openPopout);
    }

    if (overlayClose) {
      overlayClose.addEventListener("click", function () {
        if (state.running) return;
        document.getElementById("bkOverlay").hidden = true;
      });
    }

    var loadBtn = document.getElementById("bkLoadBtn");
    var addBtn = document.getElementById("bkAddBtn");
    var nameInput = document.getElementById("bkNameInput");
    var entryInput = document.getElementById("bkEntryInput");
    var clearBtn = document.getElementById("bkClearBtn");
    var entryList = document.getElementById("bkEntryList");

    if (loadBtn && picker) {
      loadBtn.addEventListener("click", function () {
        loadFromPicker(picker.value);
      });
    }

    if (addBtn && nameInput && entryInput) {
      addBtn.addEventListener("click", function () {
        addEntry(nameInput.value, entryInput.value);
        nameInput.value = "";
        entryInput.value = "1";
        nameInput.focus();
      });
    }

    if (nameInput) {
      nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (addBtn) addBtn.click();
        }
      });
    }

    if (entryInput) {
      entryInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (addBtn) addBtn.click();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        if (manualEntries.length && confirm("Clear all fighters?")) {
          clearEntries();
        }
      });
    }

    if (entryList) {
      entryList.addEventListener("click", function (e) {
        var adjBtn = e.target.closest(".bk-entry-adj");
        var rmBtn = e.target.closest(".bk-entry-remove");
        if (adjBtn) {
          var idx = parseInt(adjBtn.getAttribute("data-idx"), 10);
          var delta = parseInt(adjBtn.getAttribute("data-delta"), 10);
          adjustEntry(idx, delta);
        } else if (rmBtn) {
          var idx = parseInt(rmBtn.getAttribute("data-idx"), 10);
          removeEntry(idx);
        }
      });
    }
  }

  // -- Init --
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    genSplats();
    bindEvents();

    Promise.all([fetchWOM(), fetchEvents(), fetchGiveaways()])
      .then(function (results) {
        var events = results[1] || [];
        var gaRounds = results[2] || [];
        populateEventPicker(events, gaRounds);
      })
      .catch(function () {
        var picker = document.getElementById("bkEventPicker");
        if (picker) picker.innerHTML = '<option value="">Data unavailable</option>';
      });
  }

  // -- Bootstrap --
  bindLockEvents();
  checkLock();
})();

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

  // -- Splat images (PNG assets) --
  var SPLAT_IMGS = {
    hit: "/assets/splat-hit.png",
    max: "/assets/splat-max.png",
    zero: "/assets/splat-zero.png"
  };

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
    var special = e >= 6 ? 1 : 0;
    return { base: BASE_HP, shield: shield, bonus: bonus, special: special, total: BASE_HP + shield + bonus + special };
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
    speed: 2, done: false, roundStarted: false, matchIdx: 0,
    players: [], womMap: {}
  };
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
        opt2.textContent = round.name + " (" + round.entries.length + " participants, " + total + " entries)";
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
  }

  // -- UI updates --
  function updateButton() {
    var b = document.getElementById("bkStartBtn");
    if (!b) return;
    if (state.done) { b.textContent = "Complete!"; b.disabled = true; }
    else if (state.running && fightPaused) { b.textContent = "Resume"; b.disabled = false; }
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
            '<div class="bk-trophy' + (rev ? " revealed" : "") + '"><img src="/assets/bracket-trophy.png" alt="Trophy"></div>' +
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

  // -- HP bar (smooth bar) --
  function buildHPBar(container, hpData, currentHP) {
    container.innerHTML = "";
    container.className = "bk-hp-bar-wrap";
    var total = hpData.total;
    var fillPct = (currentHP / total) * 100;

    var track = document.createElement("div");
    track.className = "bk-hp-track";
    track.id = container.id + "-track";

    var fill = document.createElement("div");
    fill.className = "bk-hp-fill";
    fill.id = container.id + "-fill";
    fill.style.width = fillPct + "%";

    var remaining = currentHP;
    var sections = [
      { type: "base", max: hpData.base },
      { type: "shield", max: hpData.shield },
      { type: "bonus", max: hpData.bonus },
      { type: "special", max: hpData.special || 0 }
    ];
    var runPct = 0;
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (sec.max <= 0) continue;
      var show = Math.min(remaining, sec.max);
      if (show > 0 && fillPct > 0) {
        var s = document.createElement("div");
        s.className = "bk-hp-section " + sec.type;
        s.style.width = ((show / total) / (fillPct / 100) * 100) + "%";
        fill.appendChild(s);
      }
      remaining -= show;
      runPct += (sec.max / total) * 100;
      if (i < sections.length - 1 && sections[i + 1].max > 0) {
        var tick = document.createElement("div");
        tick.className = "bk-hp-tick";
        tick.style.left = runPct + "%";
        track.appendChild(tick);
      }
    }

    track.appendChild(fill);

    var num = document.createElement("div");
    num.className = "bk-hp-num";
    num.id = container.id + "-num";
    num.textContent = currentHP + " / " + total;
    track.appendChild(num);

    container.appendChild(track);
  }

  function updateHPBar(id, hpData, hp) {
    var track = document.getElementById(id + "-track");
    if (!track) return;
    var total = hpData.total;
    var fillPct = (hp / total) * 100;
    var fill = document.getElementById(id + "-fill");
    if (fill) {
      fill.style.width = fillPct + "%";
      fill.innerHTML = "";
      var remaining = hp;
      var sections = [
        { type: "base", max: hpData.base },
        { type: "shield", max: hpData.shield },
        { type: "bonus", max: hpData.bonus },
        { type: "special", max: hpData.special || 0 }
      ];
      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        if (sec.max <= 0) continue;
        var show = Math.min(remaining, sec.max);
        if (show > 0 && fillPct > 0) {
          var s = document.createElement("div");
          s.className = "bk-hp-section " + sec.type;
          s.style.width = ((show / total) / (fillPct / 100) * 100) + "%";
          fill.appendChild(s);
        }
        remaining -= show;
      }
    }
    var num = document.getElementById(id + "-num");
    if (num) num.textContent = hp + " / " + total;
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
      wrap.className = "bk-hp-bar-wrap";

      var hpC = document.createElement("div");
      hpC.id = "bkHp-" + side;
      wrap.appendChild(hpC);

      var leg = document.createElement("div");
      leg.className = "bk-hp-legend";
      leg.innerHTML = '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch base"></span>' + h.base + ' HP</span>';
      if (h.shield > 0) leg.innerHTML += '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch shield"></span>+' + h.shield + ' Shield</span>';
      if (h.bonus > 0) leg.innerHTML += '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch bonus"></span>+' + h.bonus + ' Bonus</span>';
      if (h.special > 0) leg.innerHTML += '<span class="bk-hp-legend-item"><span class="bk-hp-legend-swatch special"></span>+' + h.special + ' Special</span>';
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
    var nums = ["3", "2", "1"];
    for (var i = 0; i < nums.length; i++) {
      wrap.innerHTML = '<div class="bk-countdown-num">' + nums[i] + '</div>';
      await fixedWait(COUNTDOWN_NUM_MS);
    }
    wrap.innerHTML = '<div class="bk-countdown-fight">FIGHT!</div>';
    await fixedWait(COUNTDOWN_FIGHT_MS);
    wrap.remove();
  }

  var ICON_SWORD = '<img class="bk-icon-sword" src="/assets/bracket-swords.png" alt="Attack">';
  var ICON_SHIELD = '<span class="bk-icon-shield">\u{1F6E1}\u{FE0F}</span>';
  var ICON_TROPHY = '<img class="bk-icon-trophy" src="/assets/bracket-trophy.png" alt="Winner">';

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
  var fightPaused = false;
  var fightResolve = null;

  function pauseFight() {
    fightPaused = true;
  }

  function resumeFight() {
    fightPaused = false;
    if (fightResolve) { var r = fightResolve; fightResolve = null; r(); }
  }

  function waitOrPause(ms) {
    return wait(ms).then(function () {
      if (!fightPaused) return;
      return new Promise(function (resolve) { fightResolve = resolve; });
    });
  }

  async function animateFight(p1, p2) {
    var h1 = hpForEntries(p1.entries), h2 = hpForEntries(p2.entries);
    var hp1 = h1.total, hp2 = h2.total;
    buildHPBar(document.getElementById("bkHp-left"), h1, hp1);
    buildHPBar(document.getElementById("bkHp-right"), h2, hp2);

    var s1 = document.getElementById("bkSplats-left");
    var s2 = document.getElementById("bkSplats-right");
    var log = document.getElementById("bkFightLog");
    var panel = document.getElementById("bkFightPanel");

    await showCountdown();
    await waitOrPause(200);

    var turn = 0;
    while (hp1 > 0 && hp2 > 0) {
      var atkSide = turn % 2 === 0 ? "left" : "right";
      var atk = turn % 2 === 0 ? p1.name : p2.name;
      var def = turn % 2 === 0 ? p2.name : p1.name;

      if (s1.firstChild) s1.firstChild.classList.add("dim");
      if (s2.firstChild) s2.firstChild.classList.add("dim");

      setIndicators(atkSide);
      await waitOrPause(BASE_HIT_DELAY * 2);

      var hit = rollHit();

      if (turn % 2 === 0) {
        hp2 = Math.max(0, hp2 - hit);
        s2.innerHTML = "";
        s2.appendChild(createSplat(hit));
        updateHPBar("bkHp-right", h2, hp2);
      } else {
        hp1 = Math.max(0, hp1 - hit);
        s1.innerHTML = "";
        s1.appendChild(createSplat(hit));
        updateHPBar("bkHp-left", h1, hp1);
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

      turn++;
      await waitOrPause(BASE_HIT_DELAY);
    }
    await waitOrPause(POST_KO_DELAY);

    var w = hp1 > 0;
    var wn = w ? p1.name : p2.name;
    var ln = w ? p2.name : p1.name;
    log.className = "bk-fight-log ko";
    log.textContent = ln + " has been defeated!";
    setTrophy(w ? "left" : "right");
    await waitOrPause(700);
    log.className = "bk-fight-log win";
    log.textContent = wn + " advances!";
    await waitOrPause(ADVANCE_DELAY);
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

    document.getElementById("bkOverlay").hidden = false;
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
        spawnSparkles(50);
        await wait(300);
        spawnSparkles(40);
        await wait(300);
        spawnSparkles(30);
      }
    }

    updateButton();
    updateStatus();
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
  // -- Event listeners --
  function bindEvents() {
    var startBtn = document.getElementById("bkStartBtn");
    var resetBtn = document.getElementById("bkResetBtn");
    var speedSlider = document.getElementById("bkSpeedSlider");
    var picker = document.getElementById("bkEventPicker");
    var overlayClose = document.getElementById("bkOverlayClose");

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (state.running && fightPaused) {
          document.getElementById("bkOverlay").hidden = false;
          resumeFight();
          return;
        }
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

    var overlay = document.getElementById("bkOverlay");
    if (overlayClose) {
      overlayClose.addEventListener("click", function () {
        if (state.running) { pauseFight(); updateButton(); }
        overlay.hidden = true;
      });
    }
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          if (state.running) { pauseFight(); updateButton(); }
          overlay.hidden = true;
        }
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

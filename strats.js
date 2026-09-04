/* Strat Finder -- OSRS Wiki strategy guide launcher, clan-themed.
   Tiles open {page}/Strategies on the wiki in a new tab. NPC art is hotlinked
   from the wiki: explicit img overrides use Special:FilePath, everything else
   gets its page's official thumbnail from the pageimages API (no guessed
   filenames). Initials medallions remain wherever no image arrives. */
(function () {
  "use strict";

  var WIKI = "https://oldschool.runescape.wiki";
  var RECENT_KEY = "mm-strats-recent";
  var MAX_RECENT = 4;

  /* n = display name, cat = category key.
     p = wiki page when it differs from n. img = image filename when it differs from p + ".png". */
  var TARGETS = [
    { n: "Chambers of Xeric", cat: "raid", img: "Great Olm.png" },
    { n: "Theatre of Blood", cat: "raid", img: "Verzik Vitur.png" },
    { n: "Tombs of Amascut", cat: "raid", img: "Tumeken's Warden.png" },

    { n: "Scurrius", cat: "boss" },
    { n: "Giant Mole", cat: "boss" },
    { n: "Barrows", cat: "boss", img: "Dharok the Wretched.png" },
    { n: "Hespori", cat: "boss" },
    { n: "Amoxliatl", cat: "boss" },
    { n: "Moons of Peril", cat: "boss", img: "Eclipse Moon.png" },
    { n: "Sarachnis", cat: "boss" },
    { n: "Royal Titans", cat: "boss", p: "The Royal Titans", img: "Branda the Fire Queen.png" },
    { n: "Skotizo", cat: "boss" },
    { n: "Kalphite Queen", cat: "boss" },
    { n: "Dagannoth Kings", cat: "boss", img: "Dagannoth Rex.png" },
    { n: "Mad Angel", cat: "boss" },
    { n: "The Hueycoatl", cat: "boss" },
    { n: "Zulrah", cat: "boss", img: "Zulrah (serpentine).png" },
    { n: "Vorkath", cat: "boss" },
    { n: "Phantom Muspah", cat: "boss", img: "Phantom Muspah (ranged).png" },
    { n: "Corporeal Beast", cat: "boss" },
    { n: "Nightmare", cat: "boss", p: "The Nightmare" },
    { n: "Yama", cat: "boss" },

    { n: "Callisto", cat: "wild" },
    { n: "Vet'ion", cat: "wild" },
    { n: "Venenatis", cat: "wild" },
    { n: "Artio", cat: "wild" },
    { n: "Calvar'ion", cat: "wild" },
    { n: "Spindel", cat: "wild" },
    { n: "Scorpia", cat: "wild" },
    { n: "Chaos Elemental", cat: "wild" },
    { n: "Chaos Fanatic", cat: "wild" },
    { n: "Crazy Archaeologist", cat: "wild" },
    { n: "King Black Dragon", cat: "wild" },

    { n: "Kraken", cat: "slay" },
    { n: "Thermonuclear smoke devil", cat: "slay" },
    { n: "Cerberus", cat: "slay" },
    { n: "Abyssal Sire", cat: "slay" },
    { n: "Grotesque Guardians", cat: "slay", img: "Dusk.png" },
    { n: "Alchemical Hydra", cat: "slay" },
    { n: "Araxxor", cat: "slay" },

    { n: "General Graardor", cat: "gwd" },
    { n: "Commander Zilyana", cat: "gwd" },
    { n: "Kree'arra", cat: "gwd" },
    { n: "K'ril Tsutsaroth", cat: "gwd" },
    { n: "Nex", cat: "gwd" },

    { n: "Vardorvis", cat: "dt2" },
    { n: "Duke Sucellus", cat: "dt2" },
    { n: "The Leviathan", cat: "dt2" },
    { n: "The Whisperer", cat: "dt2" },

    { n: "The Gauntlet", cat: "mini", img: "Crystalline Hunllef.png" },
    { n: "Corrupted Gauntlet", cat: "mini", p: "The Corrupted Gauntlet", img: "Corrupted Hunllef.png" },
    { n: "Fight Caves", cat: "mini", p: "TzHaar Fight Cave", img: "TzTok-Jad.png" },
    { n: "The Inferno", cat: "mini", p: "Inferno", img: "TzKal-Zuk.png" },
    { n: "Colosseum", cat: "mini", p: "Fortis Colosseum", img: "Sol Heredit.png" },

    { n: "Tempoross", cat: "skill" },
    { n: "Wintertodt", cat: "skill" },
    { n: "Zalcano", cat: "skill" }
  ];

  var CATS = [
    { key: "recent", label: "Recent" },
    { key: "raid", label: "Raids" },
    { key: "boss", label: "Bosses" },
    { key: "wild", label: "Wilderness" },
    { key: "slay", label: "Slayer" },
    { key: "gwd", label: "God Wars" },
    { key: "dt2", label: "Desert Treasure II" },
    { key: "mini", label: "Minigames" },
    { key: "skill", label: "Skilling" }
  ];

  var CHIPS = [
    { key: "all", label: "All" },
    { key: "raid", label: "Raids" },
    { key: "boss", label: "Bosses" },
    { key: "wild", label: "Wildy" },
    { key: "slay", label: "Slayer" },
    { key: "gwd", label: "God Wars" },
    { key: "dt2", label: "DT2" },
    { key: "mini", label: "Minigames" },
    { key: "skill", label: "Skilling" }
  ];

  var ALIASES = {
    cox: "Chambers of Xeric", olm: "Chambers of Xeric", chambers: "Chambers of Xeric", raids: "Chambers of Xeric",
    tob: "Theatre of Blood", theatre: "Theatre of Blood", verzik: "Theatre of Blood",
    toa: "Tombs of Amascut", tombs: "Tombs of Amascut",
    corp: "Corporeal Beast",
    kbd: "King Black Dragon",
    kq: "Kalphite Queen",
    dks: "Dagannoth Kings", rex: "Dagannoth Kings",
    gg: "Grotesque Guardians", dusk: "Grotesque Guardians",
    thermy: "Thermonuclear smoke devil", smoke: "Thermonuclear smoke devil",
    sire: "Abyssal Sire",
    hydra: "Alchemical Hydra",
    cerb: "Cerberus",
    vork: "Vorkath", vorki: "Vorkath",
    zul: "Zulrah", snek: "Zulrah",
    cg: "Corrupted Gauntlet",
    jad: "Fight Caves",
    zuk: "The Inferno", inferno: "The Inferno",
    colo: "Colosseum", sol: "Colosseum",
    muspah: "Phantom Muspah",
    nm: "Nightmare",
    calli: "Callisto",
    vene: "Venenatis",
    wt: "Wintertodt", todt: "Wintertodt",
    tempo: "Tempoross",
    huey: "The Hueycoatl", hueycoatl: "The Hueycoatl",
    titans: "Royal Titans",
    whisp: "The Whisperer",
    levi: "The Leviathan",
    duke: "Duke Sucellus",
    vard: "Vardorvis",
    mole: "Giant Mole",
    moons: "Moons of Peril",
    angel: "Mad Angel"
  };

  // -- DOM --
  var searchEl = document.getElementById("stSearch");
  var goBtn = document.getElementById("stGo");
  var chipsEl = document.getElementById("stChips");
  var sectionsEl = document.getElementById("stSections");
  if (!sectionsEl) return;

  var activeCat = "all";

  function esc(s) { var d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  function pageOf(t) { return t.p || t.n; }

  function stratUrl(t) {
    return WIKI + "/w/" + encodeURIComponent(pageOf(t).replace(/ /g, "_")) + "/Strategies";
  }

  function imgUrl(t) {
    if (t.img) return WIKI + "/w/Special:FilePath/" + encodeURIComponent(t.img.replace(/ /g, "_")) + "?width=120";
    var cached = artCache[pageOf(t)];
    return cached || "";
  }

  // Art for entries without an explicit img: the wiki pageimages API supplies each
  // page's official thumbnail, so no filenames are guessed. Cached 7 days.
  var ART_KEY = "mm-strats-art-v1";
  var artCache = {};
  try {
    var stored = JSON.parse(localStorage.getItem(ART_KEY));
    if (stored && stored.art && Date.now() - stored.ts < 7 * 864e5) artCache = stored.art;
  } catch (e) { /* */ }

  function loadArt() {
    var need = TARGETS.filter(function (t) { return !t.img && !artCache[pageOf(t)]; })
      .map(function (t) { return pageOf(t); });
    if (!need.length) return;
    var chunks = [];
    for (var i = 0; i < need.length; i += 50) chunks.push(need.slice(i, i + 50));
    chunks.forEach(function (titles) {
      var url = WIKI + "/api.php?action=query&format=json&origin=*&prop=pageimages" +
        "&piprop=thumbnail&pithumbsize=120&redirects=1&titles=" +
        encodeURIComponent(titles.join("|"));
      fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.query || !data.query.pages) return;
          var backmap = {};
          (data.query.normalized || []).concat(data.query.redirects || []).forEach(function (m) {
            backmap[m.to] = backmap[m.from] || m.from;
          });
          Object.keys(data.query.pages).forEach(function (id) {
            var pg = data.query.pages[id];
            if (!pg.thumbnail || !pg.thumbnail.source) return;
            var title = backmap[pg.title] || pg.title;
            artCache[title] = pg.thumbnail.source;
          });
          try { localStorage.setItem(ART_KEY, JSON.stringify({ ts: Date.now(), art: artCache })); } catch (e) { /* */ }
          applyArt();
        })
        .catch(function () { /* initials medallions stay */ });
    });
  }

  function applyArt() {
    sectionsEl.querySelectorAll(".st-npc img[data-page]").forEach(function (img) {
      var url = artCache[img.getAttribute("data-page")];
      if (url && img.getAttribute("src") !== url) img.setAttribute("src", url);
    });
  }

  function initials(name) {
    var words = name.replace(/^The /, "").split(/\s+/).filter(function (w) {
      return !/^(of|the)$/i.test(w);
    });
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return words[0].slice(0, 2).toUpperCase();
  }

  // -- Recent --
  function getRecent() {
    try {
      var d = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  }

  function pushRecent(name) {
    try {
      var list = getRecent().filter(function (x) { return x !== name; });
      list.unshift(name);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch (e) { /* */ }
  }

  // -- Render --
  function tileHtml(t) {
    return '<a class="st-tile" href="' + stratUrl(t) + '" target="_blank" rel="noopener" data-name="' + esc(t.n) + '">' +
      '<span class="st-npc"><span class="st-npc-init">' + esc(initials(t.n)) + '</span>' +
      (imgUrl(t) || !t.img
        ? '<img' + (imgUrl(t) ? ' src="' + imgUrl(t) + '"' : '') + ' data-page="' + esc(pageOf(t)) + '" alt="" loading="lazy">'
        : '') + '</span>' +
      '<span class="st-tinfo"><span class="st-tname">' + esc(t.n) + '</span>' +
      '<span class="st-tsub">wiki strats</span></span></a>';
  }

  function render() {
    var recent = getRecent();
    var html = "";
    for (var c = 0; c < CATS.length; c++) {
      var cat = CATS[c];
      var items;
      if (cat.key === "recent") {
        items = recent.map(function (name) {
          return TARGETS.find(function (t) { return t.n === name; });
        }).filter(Boolean);
        if (!items.length) continue;
      } else {
        items = TARGETS.filter(function (t) { return t.cat === cat.key; });
      }
      var tiles = "";
      for (var i = 0; i < items.length; i++) tiles += tileHtml(items[i]);
      html += '<div class="st-section' + (cat.key === "recent" ? " st-recent" : "") + '" data-c="' + cat.key + '">' +
        '<div class="st-sect-head"><h2>' + cat.label + '</h2><div class="st-sect-rule"></div>' +
        '<span class="st-sect-count">' + (cat.key === "recent" ? "yours" : items.length) + '</span></div>' +
        '<div class="st-tiles">' + tiles + '</div></div>';
    }
    sectionsEl.innerHTML = html;

    // Broken image -> initials medallion stays
    sectionsEl.querySelectorAll(".st-npc img").forEach(function (img) {
      img.addEventListener("error", function () {
        img.parentElement.classList.remove("has-img");
        img.remove();
      });
      function mark() { img.parentElement.classList.add("has-img"); }
      if (img.complete && img.naturalWidth) mark();
      else img.addEventListener("load", mark);
    });

    applyFilters();
  }

  function renderChips() {
    var html = "";
    for (var i = 0; i < CHIPS.length; i++) {
      var ch = CHIPS[i];
      html += '<span class="st-chip' + (ch.key === activeCat ? " on" : "") + '" data-c="' + ch.key + '">' + ch.label + '</span>';
    }
    chipsEl.innerHTML = html;
  }

  // -- Filtering --
  function applyFilters() {
    var q = (searchEl.value || "").trim().toLowerCase();
    sectionsEl.querySelectorAll(".st-section").forEach(function (sec) {
      var key = sec.getAttribute("data-c");
      var catOk = activeCat === "all" || key === activeCat || key === "recent";
      var visible = 0;
      sec.querySelectorAll(".st-tile").forEach(function (tile) {
        var name = tile.getAttribute("data-name").toLowerCase();
        var show = catOk && (!q || name.indexOf(q) !== -1);
        tile.style.display = show ? "" : "none";
        if (show) visible++;
      });
      sec.style.display = visible ? "" : "none";
    });
  }

  // -- Go --
  function resolveQuery(raw) {
    var q = raw.trim().toLowerCase();
    if (!q) return null;
    if (ALIASES[q]) {
      return TARGETS.find(function (t) { return t.n === ALIASES[q]; }) || null;
    }
    var exact = TARGETS.find(function (t) { return t.n.toLowerCase() === q; });
    if (exact) return exact;
    var matches = TARGETS.filter(function (t) { return t.n.toLowerCase().indexOf(q) !== -1; });
    return matches.length ? matches[0] : null;
  }

  function go() {
    var raw = searchEl.value.trim();
    if (!raw) return;
    var t = resolveQuery(raw);
    if (t) {
      pushRecent(t.n);
      window.open(stratUrl(t), "_blank", "noopener");
      searchEl.value = "";
      render();
    } else {
      window.open(WIKI + "/?search=" + encodeURIComponent(raw), "_blank", "noopener");
    }
  }

  // -- Events --
  chipsEl.addEventListener("click", function (e) {
    var chip = e.target.closest(".st-chip");
    if (!chip) return;
    activeCat = chip.getAttribute("data-c");
    renderChips();
    applyFilters();
  });

  sectionsEl.addEventListener("click", function (e) {
    var tile = e.target.closest(".st-tile");
    if (!tile) return;
    pushRecent(tile.getAttribute("data-name"));
    // Refresh the Recent row after the tab opens
    setTimeout(render, 300);
  });

  searchEl.addEventListener("input", applyFilters);
  searchEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); go(); }
  });
  goBtn.addEventListener("click", go);

  // -- Init --
  renderChips();
  render();
  loadArt();
})();

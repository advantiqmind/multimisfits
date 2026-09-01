/* Loot Wheel -- ported from the 1BOX wheel, retinted for Multi-Misfits.
   Entries live in localStorage; participants load from /api/events (same origin,
   session cookie rides along). Wheel state syncs to the popout via BroadcastChannel. */
(function () {
  "use strict";

  // -- Config --
  var SEGMENT_COLORS = [
    "#4a3215", "#2b2419", "#5a4520", "#1f1a10",
    "#6b5836", "#3a3020", "#4d3a1a", "#241e14"
  ];
  var GOLD      = "#ffcb2f";
  var GOLD_DIM  = "#c9a227";
  var ACCENT    = "#4ad04a";
  var TEXT_CLR  = "#e6d9b8";
  var BG_DARK   = "#131009";
  var FRICTION  = 0.988;
  var STOP_VEL  = 0.15;
  var KEY       = "mm-wheel-v1";

  // -- State --
  var entries = [];
  var prize = "";
  var rotation = 0;
  var velocity = 0;
  var spinning = false;
  var lastWinnerName = "";
  var isSpinOwner = false;
  var eventsById = {};

  // -- Sync --
  var channel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("mm-loot-wheel") : null;

  function broadcast(msg) { if (channel) channel.postMessage(msg); }

  // -- DOM --
  var canvas      = document.getElementById("wheel");
  if (!canvas) return;
  var ctx         = canvas.getContext("2d");
  var nameInput   = document.getElementById("nameInput");
  var prizeInput  = document.getElementById("prizeInput");
  var addBtn      = document.getElementById("addBtn");
  var spinBtn     = document.getElementById("spinBtn");
  var clearBtn    = document.getElementById("clearBtn");
  var entryList   = document.getElementById("entryList");
  var entryCount  = document.getElementById("entryCount");
  var modal       = document.getElementById("winnerModal");
  var winnerEl    = document.getElementById("winnerName");
  var prizeLineEl = document.getElementById("prizeLine");
  var modalClose  = document.getElementById("modalClose");
  var modalRemove = document.getElementById("modalRemove");
  var popoutBtn   = document.getElementById("popoutBtn");
  var eventSelect = document.getElementById("eventSelect");
  var loadEventBtn = document.getElementById("loadEventBtn");
  var wheelBadge  = document.getElementById("wheel-badge");

  // -- Helpers --
  function totalSlots() {
    var t = 0;
    for (var i = 0; i < entries.length; i++) t += entries[i].count;
    return t;
  }

  function esc(s) { var d = document.createElement("span"); d.textContent = s; return d.innerHTML; }

  function segmentAngles() {
    var total = totalSlots();
    if (!total) return [];
    var angles = [];
    var offset = 0;
    for (var i = 0; i < entries.length; i++) {
      var arc = (entries[i].count / total) * Math.PI * 2;
      angles.push({ start: offset, arc: arc, idx: i });
      offset += arc;
    }
    return angles;
  }

  // -- Persistence --
  function save() {
    try {
      if (prizeInput) prize = prizeInput.value;
      localStorage.setItem(KEY, JSON.stringify({ entries: entries, prize: prize }));
    } catch (e) { /* */ }
    broadcast({ type: "sync" });
  }

  function load() {
    try {
      var d = localStorage.getItem(KEY);
      if (!d) return;
      var obj = JSON.parse(d);
      if (Array.isArray(obj.entries)) entries = obj.entries;
      if (obj.prize != null) {
        prize = obj.prize;
        if (prizeInput) prizeInput.value = prize;
      }
    } catch (e) { /* */ }
  }

  // -- Entry management --
  function addEntry(raw) {
    var name = String(raw).trim();
    if (!name || spinning) return;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].name.toLowerCase() === name.toLowerCase()) {
        entries[i].count++;
        save(); renderEntries(); drawWheel();
        return;
      }
    }
    entries.push({ name: name, count: 1 });
    save(); renderEntries(); drawWheel();
  }

  function adjustCount(idx, delta) {
    if (spinning || idx < 0 || idx >= entries.length) return;
    entries[idx].count = Math.max(1, entries[idx].count + delta);
    save(); renderEntries(); drawWheel();
  }

  function removeEntry(idx) {
    if (spinning || idx < 0 || idx >= entries.length) return;
    entries.splice(idx, 1);
    save(); renderEntries(); drawWheel();
  }

  function clearAll() {
    if (spinning || !entries.length) return;
    entries = [];
    save(); renderEntries(); drawWheel();
  }

  function setEntries(names) {
    entries = [];
    for (var i = 0; i < names.length; i++) {
      var name = String(names[i]).trim();
      if (!name) continue;
      var dupe = false;
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].name.toLowerCase() === name.toLowerCase()) { dupe = true; break; }
      }
      if (!dupe) entries.push({ name: name, count: 1 });
    }
    save(); renderEntries(); drawWheel();
  }

  function renderEntries() {
    if (!entryList) {
      if (spinBtn) spinBtn.disabled = entries.length < 2;
      return;
    }
    var html = "";
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      html += '<div class="wheel-entry">' +
        '<span class="wheel-entry-dot" style="background:' + SEGMENT_COLORS[i % SEGMENT_COLORS.length] + '"></span>' +
        '<span class="wheel-entry-name">' + esc(e.name) + '</span>' +
        '<span class="wheel-entry-controls">' +
          '<button class="wheel-entry-adj minus" data-i="' + i + '" data-d="-1">−</button>' +
          '<span class="wheel-entry-qty">' + e.count + '</span>' +
          '<button class="wheel-entry-adj plus" data-i="' + i + '" data-d="1">+</button>' +
        '</span>' +
        '<button class="wheel-entry-remove" data-i="' + i + '">×</button>' +
        '</div>';
    }
    entryList.innerHTML = html;
    if (entryCount) entryCount.textContent = totalSlots();
    spinBtn.disabled = entries.length < 2;
  }

  // -- Event participants --
  function loadParticipants(ev, silent) {
    if (!ev || !ev.participants || !ev.participants.length) return;
    if (entries.length && !silent) {
      if (!window.confirm("Replace the current entries with " + ev.participants.length + " participants from \"" + ev.name + "\"?")) return;
    }
    setEntries(ev.participants);
    if (prizeInput && !prizeInput.value) prizeInput.focus();
  }

  function populateEventSelect(events) {
    if (!eventSelect) return;
    var withParts = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].participants && events[i].participants.length) withParts.push(events[i]);
    }
    if (!withParts.length) {
      eventSelect.innerHTML = '<option value="">No events with participants</option>';
      return;
    }
    var html = '<option value="">Pick an event...</option>';
    for (var j = 0; j < withParts.length; j++) {
      var ev = withParts[j];
      eventsById[ev.id] = ev;
      html += '<option value="' + esc(ev.id) + '">' + esc(ev.name) + ' (' + ev.participants.length + ' joined)</option>';
    }
    eventSelect.innerHTML = html;
  }

  function fetchEvents() {
    if (!eventSelect) return;
    fetch("/api/events", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.configured || !Array.isArray(data.events)) {
          eventSelect.innerHTML = '<option value="">Events unavailable</option>';
          if (wheelBadge) wheelBadge.classList.add("badge-offline");
          return;
        }
        populateEventSelect(data.events);
        if (wheelBadge) wheelBadge.textContent = "⟳ from Discord";

        var params = new URLSearchParams(window.location.search);
        var wanted = params.get("event");
        if (wanted && eventsById[wanted]) {
          eventSelect.value = wanted;
          loadParticipants(eventsById[wanted]);
          history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch(function () {
        eventSelect.innerHTML = '<option value="">Events unavailable</option>';
        if (wheelBadge) wheelBadge.classList.add("badge-offline");
      });
  }

  // -- Canvas sizing --
  var dpr = window.devicePixelRatio || 1;
  var wSize = 0;

  function resize() {
    var wrap = canvas.parentElement;
    var s = Math.min(wrap.clientWidth, 500);
    wSize = s;
    canvas.style.width = s + "px";
    canvas.style.height = s + "px";
    canvas.width = s * dpr;
    canvas.height = s * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel();
  }

  // -- Drawing --
  function drawWheel() {
    var w = wSize, cx = w / 2, cy = w / 2;
    var rim = cx - 10;
    var r = rim - 8;
    ctx.clearRect(0, 0, w, w);

    var segs = segmentAngles();

    if (!segs.length) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = BG_DARK;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      ctx.fillStyle = "#a99b78";
      ctx.font = "600 15px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Add names or load an event", cx, cy);
      drawPointer(cx, cy, rim);
      return;
    }

    var n = entries.length;

    // Outer gold ring
    ctx.beginPath();
    ctx.arc(cx, cy, rim, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = GOLD;
    ctx.stroke();

    // Segments
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var a0 = rotation + seg.start - Math.PI / 2;
      var a1 = a0 + seg.arc;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.strokeStyle = "rgba(255,203,47,.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a0 + seg.arc / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = TEXT_CLR;
      var fs = n > 24 ? 9 : n > 16 ? 11 : n > 10 ? 12 : 14;
      ctx.font = "700 " + fs + "px system-ui";
      var label = entries[i].name;
      if (label.length > 14 && n > 10) label = label.slice(0, 12) + "…";
      ctx.fillText(label, r - 14, 0);
      ctx.restore();
    }

    for (var i = 0; i < segs.length; i++) {
      var pa = rotation + segs[i].start - Math.PI / 2;
      var px = cx + Math.cos(pa) * (r + 4);
      var py = cy + Math.sin(pa) * (r + 4);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = GOLD_DIM;
      ctx.fill();
    }

    var hub = n > 14 ? 20 : 26;
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, Math.PI * 2);
    ctx.fillStyle = BG_DARK;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();

    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, hub);
    g.addColorStop(0, "rgba(74,208,74,.12)");
    g.addColorStop(1, "rgba(74,208,74,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.fillStyle = ACCENT;
    ctx.font = "800 " + (hub > 22 ? 13 : 10) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SPIN", cx, cy);

    drawPointer(cx, cy, rim);
  }

  function drawPointer(cx, cy, rim) {
    var tipY = cy - rim + 10;
    var baseY = cy - rim - 14;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - 13, baseY);
    ctx.lineTo(cx + 13, baseY);
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = GOLD_DIM;
    ctx.stroke();
  }

  // -- Spin --
  function spin() {
    if (spinning || entries.length < 2) return;
    spinning = true;
    isSpinOwner = true;
    spinBtn.disabled = true;
    velocity = 15 + Math.random() * 15;
    broadcast({ type: "spin", velocity: velocity });
    tick();
  }

  function tick() {
    rotation += velocity * (Math.PI / 180);
    velocity *= FRICTION;
    drawWheel();
    if (isSpinOwner) {
      broadcast({ type: "frame", rotation: rotation, velocity: velocity });
    }
    if (velocity < STOP_VEL) {
      spinning = false;
      spinBtn.disabled = false;
      if (isSpinOwner) {
        pickWinner();
        broadcast({ type: "winner", rotation: rotation, name: lastWinnerName });
        isSpinOwner = false;
      }
      return;
    }
    requestAnimationFrame(tick);
  }

  function pickWinner() {
    var segs = segmentAngles();
    var a = ((-rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    var idx = 0;
    for (var i = 0; i < segs.length; i++) {
      if (a >= segs[i].start && a < segs[i].start + segs[i].arc) { idx = i; break; }
    }
    lastWinnerName = entries[idx].name;
    flashWinner(idx, 0);
  }

  function flashWinner(idx, step) {
    if (step >= 6) {
      showModal(entries[idx].name);
      return;
    }
    drawWheel();
    if (step % 2 === 0) highlightSegment(idx);
    setTimeout(function () { flashWinner(idx, step + 1); }, 150);
  }

  function highlightSegment(idx) {
    var segs = segmentAngles();
    var seg = segs[idx];
    if (!seg) return;
    var w = wSize, cx = w / 2, cy = w / 2;
    var rim = cx - 10, r = rim - 8;
    var a0 = rotation + seg.start - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a0 + seg.arc);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,203,47,.25)";
    ctx.fill();
  }

  function showModal(name) {
    if (!modal) return;
    winnerEl.textContent = name;
    if (prizeInput) prize = prizeInput.value.trim();
    if (prizeLineEl) prizeLineEl.textContent = prize;
    modal.hidden = false;
  }

  function closeModal() { if (modal) modal.hidden = true; }

  function removeWinner() {
    if (lastWinnerName) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === lastWinnerName) {
          entries.splice(i, 1);
          break;
        }
      }
      lastWinnerName = "";
      save(); renderEntries(); drawWheel();
    }
    closeModal();
  }

  // -- Cross-window sync --
  if (channel) {
    channel.onmessage = function (e) {
      var d = e.data;
      if (d.type === "sync") {
        load(); renderEntries(); drawWheel();
      } else if (d.type === "spin") {
        if (!spinning) {
          spinning = true;
          isSpinOwner = false;
          spinBtn.disabled = true;
        }
      } else if (d.type === "frame") {
        rotation = d.rotation;
        velocity = d.velocity;
        drawWheel();
      } else if (d.type === "winner") {
        rotation = d.rotation;
        spinning = false;
        spinBtn.disabled = false;
        lastWinnerName = d.name;
        drawWheel();
        var idx = 0;
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].name === d.name) { idx = i; break; }
        }
        flashWinner(idx, 0);
      }
    };
  }

  window.addEventListener("storage", function (e) {
    if (e.key === KEY) { load(); renderEntries(); drawWheel(); }
  });

  // -- Events --
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      addEntry(nameInput.value);
      nameInput.value = "";
      nameInput.focus();
    });
  }

  if (nameInput) {
    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        addEntry(nameInput.value);
        nameInput.value = "";
      }
    });
  }

  if (prizeInput) {
    prizeInput.addEventListener("input", function () { save(); });
  }

  if (entryList) {
    entryList.addEventListener("click", function (e) {
      var adj = e.target.closest(".wheel-entry-adj");
      if (adj) { adjustCount(Number(adj.dataset.i), Number(adj.dataset.d)); return; }
      var rm = e.target.closest(".wheel-entry-remove");
      if (rm) removeEntry(Number(rm.dataset.i));
    });
  }

  if (loadEventBtn) {
    loadEventBtn.addEventListener("click", function () {
      var id = eventSelect ? eventSelect.value : "";
      if (id && eventsById[id]) loadParticipants(eventsById[id]);
    });
  }

  if (clearBtn) clearBtn.addEventListener("click", clearAll);
  spinBtn.addEventListener("click", spin);
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalRemove) modalRemove.addEventListener("click", removeWinner);

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }

  canvas.addEventListener("click", function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (wSize / rect.width) - wSize / 2;
    var y = (e.clientY - rect.top) * (wSize / rect.height) - wSize / 2;
    if (Math.sqrt(x * x + y * y) < 40) spin();
  });

  if (popoutBtn) {
    popoutBtn.addEventListener("click", function () {
      window.open("/wheel-popout.html", "mm-wheel-popout",
        "width=600,height=680,resizable=yes");
    });
  }

  window.addEventListener("resize", resize);

  // -- Init --
  load();
  renderEntries();
  resize();
  fetchEvents();
})();

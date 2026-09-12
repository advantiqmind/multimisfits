// calendar.js -- Shared event calendar overlay for EventForge + Idea Board
// Shows EventForge draft saves (draggable) and live Discord events (display-only)
// in a month grid. Drag drafts to reschedule; click to edit date/time or open in EventForge.

(function () {
  const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const CAL_MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  let calState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    drafts: [],
    live: [],
    filter: "all",
    search: "",
    selected: null, // for mobile tap-to-move
    popover: null,
    loading: false,
    accessCode: "",
  };

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement("style");
    s.textContent = `
.cal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:none;place-items:center;padding:16px}
.cal-overlay.open{display:grid}
.cal-modal{width:min(720px,calc(100% - 32px));max-height:90vh;overflow:auto;background:#1e1809;border:1px solid #3a2e1a;border-radius:14px;box-shadow:0 20px 60px #000;padding:0;color:#e6d9b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px}
.cal-head{padding:14px 16px;border-bottom:1px solid #3a2e1a;display:flex;align-items:center;gap:10px}
.cal-head h3{margin:0;font-family:'Cinzel',serif;font-size:16px;letter-spacing:.04em}
.cal-close{border:0;background:transparent;color:#a99b78;font-size:22px;cursor:pointer;padding:4px 8px;border-radius:8px;margin-left:auto}
.cal-close:hover{background:#261f0f;color:#fff}
.cal-toolbar{padding:12px 16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cal-search{flex:1;min-width:160px;background:#0d0b08;color:#e6d9b8;border:1px solid #3a2e1a;border-radius:9px;padding:8px 10px;font-size:13px;font-family:inherit}
.cal-search:focus{border-color:#6b5836;outline:none;box-shadow:0 0 0 2px rgba(255,203,47,.12)}
.cal-filters{padding:8px 16px;display:flex;gap:6px;flex-wrap:wrap}
.cal-fbtn{padding:6px 10px;border:1px solid #3a2e1a;border-radius:8px;background:#1e1809;color:#a99b78;font-size:12px;font-weight:700;cursor:pointer}
.cal-fbtn.active{border-color:#8a7449;color:#ffcb2f;background:#1a1305}
.cal-nav{padding:8px 16px;display:flex;align-items:center;gap:12px}
.cal-nav button{border:1px solid #3a2e1a;background:#1e1809;color:#e6d9b8;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700}
.cal-nav button:hover{border-color:#6b5836;color:#ffcb2f}
.cal-nav .cal-month-label{font-family:'Cinzel',serif;font-size:15px;font-weight:700;min-width:180px;text-align:center}
.cal-nav .cal-today{margin-left:auto;font-size:12px}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);padding:0 16px 16px;gap:1px}
.cal-day-head{padding:8px 4px;text-align:center;font-size:11px;font-weight:800;color:#7a6c4a;text-transform:uppercase;letter-spacing:.06em}
.cal-cell{min-height:80px;background:#110e07;border:1px solid #2a2010;padding:4px;position:relative;transition:background .15s}
.cal-cell.other-month{opacity:.35}
.cal-cell.today{border-color:#6b5836;background:#1a1305}
.cal-cell.drop-target{background:#261f0f;border-color:#8a7449}
.cal-cell .cal-date{font-size:11px;color:#7a6c4a;font-weight:700;padding:2px 4px}
.cal-cell.today .cal-date{color:#ffcb2f}
.cal-pill{display:block;padding:3px 6px;margin:1px 0;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:transform .1s}
.cal-pill:hover{transform:scale(1.03)}
.cal-pill.draft{background:#1a1305;border:1px dashed #6b5836;color:#c9a227}
.cal-pill.draft[draggable="true"]{cursor:grab}
.cal-pill.draft.selected{border-style:solid;background:#261f0f;box-shadow:0 0 0 2px #ffcb2f}
.cal-pill.live{background:#1a2a1a;border:1px solid #2a5a2a;color:#4ad04a}
.cal-pill.dragging{opacity:.4}
.cal-conflict{position:absolute;top:2px;right:4px;font-size:10px;font-weight:800;color:#f7c76d;background:#3a2e1a;border-radius:99px;padding:1px 5px}
.cal-popover{position:fixed;z-index:210;width:min(320px,calc(100vw - 32px));background:#1e1809;border:1px solid #3a2e1a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.6);padding:14px;display:none}
.cal-popover.open{display:block}
.cal-popover h4{margin:0 0 10px;font-family:'Cinzel',serif;font-size:14px;color:#ffcb2f}
.cal-popover .cal-pop-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.cal-popover .cal-pop-label{font-size:11px;color:#7a6c4a;font-weight:800;text-transform:uppercase;min-width:50px}
.cal-popover input{background:#0d0b08;color:#e6d9b8;border:1px solid #3a2e1a;border-radius:8px;padding:6px 8px;font-size:13px;font-family:inherit;color-scheme:dark}
.cal-popover input:focus{border-color:#6b5836;outline:none}
.cal-popover .cal-pop-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.cal-popover .cal-pop-btn{padding:6px 10px;border:1px solid #3a2e1a;border-radius:8px;background:#1e1809;color:#e6d9b8;font-size:12px;font-weight:700;cursor:pointer}
.cal-popover .cal-pop-btn:hover{border-color:#6b5836;color:#ffcb2f}
.cal-popover .cal-pop-btn.gold{background:linear-gradient(#ffcb2f,#c9a227);color:#0d0b08;border-color:#f0d860}
.cal-popover .cal-pop-type{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px}
.cal-popover .cal-pop-type.draft{background:#1a1305;color:#c9a227;border:1px dashed #6b5836}
.cal-popover .cal-pop-type.live{background:#1a2a1a;color:#4ad04a;border:1px solid #2a5a2a}
.cal-legend{padding:4px 16px 12px;display:flex;gap:16px;font-size:11px;color:#7a6c4a}
.cal-legend span{display:flex;align-items:center;gap:4px}
.cal-legend .cal-leg-draft{width:14px;height:10px;border:1px dashed #6b5836;border-radius:3px;background:#1a1305}
.cal-legend .cal-leg-live{width:14px;height:10px;border:1px solid #2a5a2a;border-radius:3px;background:#1a2a1a}
.cal-loading{padding:40px;text-align:center;color:#7a6c4a}
.cal-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);background:#1a1305;border:1px solid #3a2e1a;border-radius:10px;padding:10px 14px;opacity:0;pointer-events:none;transition:.2s;z-index:220;color:#e6d9b8;font-size:13px}
.cal-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:600px){
  .cal-cell{min-height:56px}
  .cal-pill{font-size:10px;padding:2px 4px}
  .cal-month-label{font-size:13px!important;min-width:140px!important}
}
`;
    document.head.appendChild(s);
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function calToast(msg) {
    let t = document.getElementById("calToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "calToast";
      t.className = "cal-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove("show"), 2500);
  }

  function dateKey(dateStr) {
    return dateStr || "";
  }

  function localDate(isoStr) {
    if (!isoStr) return "";
    if (isoStr.length === 10) return isoStr;
    const d = new Date(isoStr);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function localTime(isoStr) {
    if (!isoStr) return "";
    if (isoStr.length <= 10) return "";
    const d = new Date(isoStr);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function addDays(isoDate, n) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    if (!a || !b) return 0;
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  // Build calendar grid days for a given month
  function getMonthGrid(year, month) {
    const first = new Date(year, month, 1);
    const dow = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    // Leading days from previous month
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = dow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month - 1 < 0 ? 11 : month - 1;
      const y = month - 1 < 0 ? year - 1 : year;
      cells.push({
        day: d,
        month: m,
        year: y,
        iso: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        other: true,
      });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        month,
        year,
        iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        other: false,
      });
    }
    // Trailing days
    const rem = 7 - (cells.length % 7);
    if (rem < 7) {
      const nm = month + 1 > 11 ? 0 : month + 1;
      const ny = month + 1 > 11 ? year + 1 : year;
      for (let d = 1; d <= rem; d++) {
        cells.push({
          day: d,
          month: nm,
          year: ny,
          iso: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          other: true,
        });
      }
    }
    return cells;
  }

  function eventsOnDate(iso) {
    const all = getFilteredEvents();
    return all.filter((e) => {
      if (!e.startDate) return false;
      if (e.endDate && e.endDate > e.startDate) {
        return iso >= e.startDate && iso <= e.endDate;
      }
      return e.startDate === iso;
    });
  }

  function getFilteredEvents() {
    let all = [];
    if (calState.filter === "all" || calState.filter === "draft") {
      all = all.concat(calState.drafts);
    }
    if (calState.filter === "all" || calState.filter === "live") {
      all = all.concat(calState.live);
    }
    if (calState.search) {
      const q = calState.search.toLowerCase();
      all = all.filter((e) => e.name.toLowerCase().includes(q));
    }
    return all;
  }

  async function fetchCalendarData() {
    calState.loading = true;
    renderCalendar();

    const [draftsRes, eventsRes] = await Promise.allSettled([
      fetch("/api/eventforge?fields=calendar").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
    ]);

    calState.drafts = [];
    if (draftsRes.status === "fulfilled" && draftsRes.value.saves) {
      calState.drafts = draftsRes.value.saves
        .filter((s) => s.type === "event" && s.date)
        .map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.date,
          startTime: s.time || "",
          endDate: s.endDate || "",
          endTime: s.endTime || "",
          timezone: s.timezone || "",
          category: s.category,
          version: s.version,
          updatedBy: s.updated_by,
          type: "draft",
        }));
    }

    calState.live = [];
    if (eventsRes.status === "fulfilled" && eventsRes.value.events) {
      calState.live = eventsRes.value.events
        .filter((e) => e.startTime)
        .map((e) => ({
          id: e.id,
          name: e.name,
          startDate: localDate(e.startTime),
          startTime: localTime(e.startTime),
          endDate: e.endTime ? localDate(e.endTime) : "",
          endTime: e.endTime ? localTime(e.endTime) : "",
          status: e.status,
          tags: e.tags || [],
          type: "live",
        }));
    }

    calState.loading = false;
    renderCalendar();
  }

  async function updateDraftDate(draft, newStartDate) {
    const code =
      calState.accessCode ||
      (typeof localStorage !== "undefined" && localStorage.getItem("mm-eventforge-access")) ||
      "";
    if (!code) {
      calToast("Access code required to move events");
      return false;
    }

    // Fetch the full save to get its data blob
    let fullSave;
    try {
      const r = await fetch(`/api/eventforge?id=${draft.id}`);
      if (!r.ok) throw new Error("fetch failed");
      fullSave = await r.json();
    } catch {
      calToast("Failed to load event data");
      return false;
    }

    const data = fullSave.data;
    const offset = daysBetween(draft.startDate, newStartDate);
    data.date = newStartDate;
    if (data.endDate) {
      data.endDate = addDays(data.endDate, offset);
    }

    const user =
      (typeof localStorage !== "undefined" && localStorage.getItem("mm-eventforge-user")) || "Calendar";

    try {
      const r = await fetch("/api/eventforge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          version: fullSave.version,
          user,
          data,
          access_code: code,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (err.error === "conflict") {
          calToast("Conflict: someone else updated this event. Refreshing...");
          await fetchCalendarData();
          return false;
        }
        if (err.error === "invalid access code") {
          calToast("Invalid access code");
          return false;
        }
        calToast("Failed to update: " + (err.error || r.status));
        return false;
      }
      // Update local state
      draft.startDate = newStartDate;
      if (draft.endDate) {
        draft.endDate = addDays(draft.endDate, offset);
      }
      const result = await r.json();
      draft.version = result.version;
      calToast("Event moved to " + newStartDate);
      return true;
    } catch {
      calToast("Network error updating event");
      return false;
    }
  }

  async function updateDraftDateTime(draft, newDate, newTime, newEndDate, newEndTime) {
    const code =
      calState.accessCode ||
      (typeof localStorage !== "undefined" && localStorage.getItem("mm-eventforge-access")) ||
      "";
    if (!code) {
      calToast("Access code required");
      return false;
    }

    let fullSave;
    try {
      const r = await fetch(`/api/eventforge?id=${draft.id}`);
      if (!r.ok) throw new Error("fetch failed");
      fullSave = await r.json();
    } catch {
      calToast("Failed to load event data");
      return false;
    }

    const data = fullSave.data;
    if (newDate) data.date = newDate;
    if (newTime !== undefined) data.time = newTime;
    if (newEndDate !== undefined) data.endDate = newEndDate;
    if (newEndTime !== undefined) data.endTime = newEndTime;

    const user =
      (typeof localStorage !== "undefined" && localStorage.getItem("mm-eventforge-user")) || "Calendar";

    try {
      const r = await fetch("/api/eventforge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          version: fullSave.version,
          user,
          data,
          access_code: code,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        calToast(err.error === "conflict" ? "Conflict. Refreshing..." : "Update failed");
        if (err.error === "conflict") await fetchCalendarData();
        return false;
      }
      const result = await r.json();
      draft.startDate = data.date;
      draft.startTime = data.time || "";
      draft.endDate = data.endDate || "";
      draft.endTime = data.endTime || "";
      draft.version = result.version;
      calToast("Event updated");
      return true;
    } catch {
      calToast("Network error");
      return false;
    }
  }

  function renderCalendar() {
    const container = document.getElementById("calBody");
    if (!container) return;

    if (calState.loading) {
      container.innerHTML = '<div class="cal-loading">Loading events...</div>';
      return;
    }

    const { year, month } = calState;
    const cells = getMonthGrid(year, month);
    const todayISO = localDate(new Date().toISOString());

    let html = "";
    // Day headers
    for (const d of CAL_DAYS) {
      html += `<div class="cal-day-head">${d}</div>`;
    }
    // Cells
    for (const cell of cells) {
      const isToday = cell.iso === todayISO;
      const events = eventsOnDate(cell.iso);
      const classes = ["cal-cell"];
      if (cell.other) classes.push("other-month");
      if (isToday) classes.push("today");

      html += `<div class="${classes.join(" ")}" data-date="${cell.iso}">`;
      html += `<div class="cal-date">${cell.day}</div>`;
      if (events.length > 2) {
        html += `<span class="cal-conflict">${events.length}</span>`;
      }
      for (const ev of events) {
        const isDraft = ev.type === "draft";
        const isSelected = calState.selected && calState.selected.id === ev.id;
        html += `<div class="cal-pill ${isDraft ? "draft" : "live"} ${isSelected ? "selected" : ""}" ${isDraft ? 'draggable="true"' : ""} data-id="${esc(ev.id)}" data-type="${ev.type}" title="${esc(ev.name)}">${esc(ev.name)}</div>`;
      }
      html += "</div>";
    }

    container.innerHTML = html;
    bindGrid();
  }

  function bindGrid() {
    const container = document.getElementById("calBody");
    if (!container) return;

    // Drag and drop (desktop)
    container.querySelectorAll('.cal-pill[draggable="true"]').forEach((pill) => {
      pill.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", pill.dataset.id);
        e.dataTransfer.effectAllowed = "move";
        pill.classList.add("dragging");
      });
      pill.addEventListener("dragend", () => {
        pill.classList.remove("dragging");
        container.querySelectorAll(".drop-target").forEach((c) => c.classList.remove("drop-target"));
      });
    });

    container.querySelectorAll(".cal-cell").forEach((cell) => {
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        cell.classList.add("drop-target");
      });
      cell.addEventListener("dragleave", () => {
        cell.classList.remove("drop-target");
      });
      cell.addEventListener("drop", async (e) => {
        e.preventDefault();
        cell.classList.remove("drop-target");
        const id = e.dataTransfer.getData("text/plain");
        const draft = calState.drafts.find((d) => d.id === id);
        if (!draft) return;
        const newDate = cell.dataset.date;
        if (newDate === draft.startDate) return;
        await updateDraftDate(draft, newDate);
        renderCalendar();
      });

      // Mobile tap-to-move: tap a cell when an event is selected
      cell.addEventListener("click", async (e) => {
        if (e.target.closest(".cal-pill")) return; // handled by pill click
        if (!calState.selected) return;
        const newDate = cell.dataset.date;
        if (newDate === calState.selected.startDate) {
          calState.selected = null;
          renderCalendar();
          return;
        }
        const ok = await updateDraftDate(calState.selected, newDate);
        calState.selected = null;
        renderCalendar();
      });
    });

    // Pill click: popover or select
    container.querySelectorAll(".cal-pill").forEach((pill) => {
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = pill.dataset.id;
        const type = pill.dataset.type;
        const ev =
          type === "draft"
            ? calState.drafts.find((d) => d.id === id)
            : calState.live.find((d) => d.id === id);
        if (!ev) return;

        // On narrow screens, use tap-to-select for drafts
        if (ev.type === "draft" && window.innerWidth <= 600) {
          if (calState.selected && calState.selected.id === ev.id) {
            calState.selected = null;
          } else {
            calState.selected = ev;
          }
          closePopover();
          renderCalendar();
          return;
        }

        showPopover(ev, pill);
      });
    });
  }

  function showPopover(ev, anchor) {
    closePopover();
    const pop = document.getElementById("calPopover");
    if (!pop) return;

    const isDraft = ev.type === "draft";
    let html = `<h4>${esc(ev.name)} <span class="cal-pop-type ${ev.type}">${isDraft ? "Draft" : "Live"}</span></h4>`;

    if (isDraft) {
      html += `
        <div class="cal-pop-row"><span class="cal-pop-label">Start</span><input type="date" id="calPopDate" value="${esc(ev.startDate)}"><input type="time" id="calPopTime" value="${esc(ev.startTime)}" style="width:100px"></div>
        <div class="cal-pop-row"><span class="cal-pop-label">End</span><input type="date" id="calPopEndDate" value="${esc(ev.endDate)}"><input type="time" id="calPopEndTime" value="${esc(ev.endTime)}" style="width:100px"></div>
        <div class="cal-pop-actions">
          <button class="cal-pop-btn gold" id="calPopSave">Save</button>
          <button class="cal-pop-btn" id="calPopOpen">Open in EventForge</button>
          <button class="cal-pop-btn" id="calPopClose">Cancel</button>
        </div>`;
    } else {
      html += `
        <div class="cal-pop-row"><span class="cal-pop-label">Start</span><span>${esc(ev.startDate)} ${esc(ev.startTime)}</span></div>
        ${ev.endDate ? `<div class="cal-pop-row"><span class="cal-pop-label">End</span><span>${esc(ev.endDate)} ${esc(ev.endTime)}</span></div>` : ""}
        <div class="cal-pop-row"><span class="cal-pop-label">Status</span><span>${esc(ev.status || "")}</span></div>
        <div class="cal-pop-actions"><button class="cal-pop-btn" id="calPopClose">Close</button></div>`;
    }

    pop.innerHTML = html;
    pop.classList.add("open");

    // Position near anchor
    const rect = anchor.getBoundingClientRect();
    const pw = 320;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    if (left < 16) left = 16;
    if (top + 250 > window.innerHeight) top = rect.top - 260;
    if (top < 16) top = 16;
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    document.getElementById("calPopClose").onclick = closePopover;

    if (isDraft) {
      document.getElementById("calPopSave").onclick = async () => {
        const d = document.getElementById("calPopDate").value;
        const t = document.getElementById("calPopTime").value;
        const ed = document.getElementById("calPopEndDate").value;
        const et = document.getElementById("calPopEndTime").value;
        const ok = await updateDraftDateTime(ev, d, t, ed, et);
        if (ok) {
          closePopover();
          renderCalendar();
        }
      };
      const openBtn = document.getElementById("calPopOpen");
      if (openBtn) {
        openBtn.onclick = () => {
          window.open("/eventforge.html", "_blank");
          closePopover();
        };
      }
    }
  }

  function closePopover() {
    const pop = document.getElementById("calPopover");
    if (pop) pop.classList.remove("open");
  }

  function renderOverlay() {
    const { year, month } = calState;
    const ov = document.getElementById("calOverlay");
    if (!ov) return;

    ov.innerHTML = `
      <div class="cal-modal">
        <div class="cal-head">
          <h3>Event Calendar</h3>
          <button class="cal-close" id="calCloseBtn" title="Close">&times;</button>
        </div>
        <div class="cal-toolbar">
          <input class="cal-search" id="calSearch" placeholder="Search events..." value="${esc(calState.search)}">
        </div>
        <div class="cal-filters">
          <button class="cal-fbtn ${calState.filter === "all" ? "active" : ""}" data-f="all">All</button>
          <button class="cal-fbtn ${calState.filter === "draft" ? "active" : ""}" data-f="draft">Drafts</button>
          <button class="cal-fbtn ${calState.filter === "live" ? "active" : ""}" data-f="live">Live</button>
        </div>
        <div class="cal-nav">
          <button id="calPrev" title="Previous month">&#9664;</button>
          <span class="cal-month-label">${CAL_MONTHS[month]} ${year}</span>
          <button id="calNext" title="Next month">&#9654;</button>
          <button class="cal-today" id="calToday">Today</button>
        </div>
        <div class="cal-grid" id="calBody"></div>
        <div class="cal-legend">
          <span><span class="cal-leg-draft"></span> Draft (draggable)</span>
          <span><span class="cal-leg-live"></span> Live (posted)</span>
        </div>
      </div>
      <div class="cal-popover" id="calPopover"></div>
    `;

    // Bind controls
    document.getElementById("calCloseBtn").onclick = closeCalendar;
    ov.onclick = (e) => {
      if (e.target === ov) closeCalendar();
    };
    document.getElementById("calSearch").oninput = (e) => {
      calState.search = e.target.value;
      renderCalendar();
    };
    document.querySelectorAll(".cal-fbtn").forEach((btn) => {
      btn.onclick = () => {
        calState.filter = btn.dataset.f;
        document.querySelectorAll(".cal-fbtn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCalendar();
      };
    });
    document.getElementById("calPrev").onclick = () => {
      calState.month--;
      if (calState.month < 0) {
        calState.month = 11;
        calState.year--;
      }
      renderCalendar();
      document.querySelector(".cal-month-label").textContent =
        CAL_MONTHS[calState.month] + " " + calState.year;
    };
    document.getElementById("calNext").onclick = () => {
      calState.month++;
      if (calState.month > 11) {
        calState.month = 0;
        calState.year++;
      }
      renderCalendar();
      document.querySelector(".cal-month-label").textContent =
        CAL_MONTHS[calState.month] + " " + calState.year;
    };
    document.getElementById("calToday").onclick = () => {
      const now = new Date();
      calState.year = now.getFullYear();
      calState.month = now.getMonth();
      renderCalendar();
      document.querySelector(".cal-month-label").textContent =
        CAL_MONTHS[calState.month] + " " + calState.year;
    };

    renderCalendar();
  }

  function closeCalendar() {
    const ov = document.getElementById("calOverlay");
    if (ov) ov.classList.remove("open");
    closePopover();
    calState.selected = null;
  }

  // Public entry point
  window.openEventCalendar = function (options) {
    options = options || {};
    injectStyles();

    if (options.accessCode) calState.accessCode = options.accessCode;

    // Reset view state
    const now = new Date();
    calState.year = now.getFullYear();
    calState.month = now.getMonth();
    calState.search = "";
    calState.filter = "all";
    calState.selected = null;
    calState.popover = null;

    // Create or reuse overlay
    let ov = document.getElementById("calOverlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "calOverlay";
      ov.className = "cal-overlay";
      document.body.appendChild(ov);
    }
    ov.classList.add("open");

    renderOverlay();
    fetchCalendarData();
  };
})();

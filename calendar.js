// calendar.js -- Event Calendar overlay for Idea Board + live Discord events
// Shows Final Approval ideas (draggable, schedulable) and live Discord events (display-only)
// in a month grid with a sidebar for unscheduled items.

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
    unscheduled: [],
    live: [],
    filter: "all",
    search: "",
    selected: null,
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
.cal-modal{width:min(1080px,calc(100% - 32px));max-height:90vh;overflow-y:auto;overflow-x:hidden;background:#1e1809;border:1px solid #3a2e1a;border-radius:14px;box-shadow:0 20px 60px #000;padding:0;color:#e6d9b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px}
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
.cal-body-wrap{display:flex;gap:0;padding:0 16px 0}
.cal-sidebar{width:200px;min-width:200px;border-right:1px solid #2a2010;padding:8px 10px 12px 0;max-height:500px;overflow-y:auto}
.cal-sidebar-head{font-size:11px;font-weight:800;color:#7a6c4a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding:0 2px}
.cal-sidebar-empty{font-size:12px;color:#5a4d30;padding:8px 4px;font-style:italic}
.cal-sidebar .cal-pill{margin:3px 0;cursor:grab}
.cal-sidebar .cal-pill.selected{border-style:solid;background:#261f0f;box-shadow:0 0 0 2px #ffcb2f}
.cal-grid-wrap{flex:1;min-width:0;padding:0 0 0 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:auto;grid-auto-rows:90px;padding:0 0 16px;gap:1px}
.cal-day-head{padding:8px 4px;text-align:center;font-size:11px;font-weight:800;color:#7a6c4a;text-transform:uppercase;letter-spacing:.06em}
.cal-cell{background:#110e07;border:1px solid #2a2010;padding:4px;position:relative;transition:background .15s;overflow:hidden;box-sizing:border-box;min-height:0}
.cal-cell.other-month{opacity:.35}
.cal-cell.today{border-color:#6b5836;background:#1a1305}
.cal-cell.drop-target{background:#261f0f;border-color:#8a7449}
.cal-cell .cal-date{font-size:11px;color:#7a6c4a;font-weight:700;padding:2px 4px}
.cal-cell.today .cal-date{color:#ffcb2f}
.cal-pill{display:block;padding:3px 6px;margin:1px 0;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:transform .1s;max-width:100%;box-sizing:border-box}
.cal-pill:hover{transform:scale(1.03)}
.cal-pill.draft{background:#1a1305;border:1px dashed #6b5836;color:#c9a227}
.cal-pill.draft[draggable="true"]{cursor:grab}
.cal-pill.draft.selected{border-style:solid;background:#261f0f;box-shadow:0 0 0 2px #ffcb2f}
.cal-pill.draft.no-template{border-color:#5a4d30;color:#8a7449}
.cal-pill.upcoming{background:#1a2a1a;border:1px solid #2a5a2a;color:#4ad04a}
.cal-pill.live{background:#2a1010;border:1px solid #8a2020;color:#f04040;animation:cal-live-pulse 1.8s ease-in-out infinite}
.cal-pill.ended{background:#1a1a1a;border:1px solid #3a3a3a;color:#7a7a7a;opacity:.65}
@keyframes cal-live-pulse{0%,100%{border-color:#8a2020;box-shadow:none}50%{border-color:#e04040;box-shadow:0 0 6px rgba(224,64,64,.35)}}
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
.cal-popover .cal-pop-type.upcoming{background:#1a2a1a;color:#4ad04a;border:1px solid #2a5a2a}
.cal-popover .cal-pop-type.live{background:#2a1010;color:#f04040;border:1px solid #8a2020}
.cal-popover .cal-pop-type.ended{background:#1a1a1a;color:#7a7a7a;border:1px solid #3a3a3a}
.cal-popover .cal-pop-hint{font-size:11px;color:#7a6c4a;margin-top:6px}
.cal-legend{padding:4px 16px 12px;display:flex;gap:16px;font-size:11px;color:#7a6c4a}
.cal-legend span{display:flex;align-items:center;gap:4px}
.cal-legend .cal-leg-draft{width:14px;height:10px;border:1px dashed #6b5836;border-radius:3px;background:#1a1305}
.cal-legend .cal-leg-upcoming{width:14px;height:10px;border:1px solid #2a5a2a;border-radius:3px;background:#1a2a1a}
.cal-legend .cal-leg-live{width:14px;height:10px;border:1px solid #8a2020;border-radius:3px;background:#2a1010}
.cal-legend .cal-leg-ended{width:14px;height:10px;border:1px solid #3a3a3a;border-radius:3px;background:#1a1a1a;opacity:.65}
.cal-loading{padding:40px;text-align:center;color:#7a6c4a}
.cal-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);background:#1a1305;border:1px solid #3a2e1a;border-radius:10px;padding:10px 14px;opacity:0;pointer-events:none;transition:.2s;z-index:220;color:#e6d9b8;font-size:13px}
.cal-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:600px){
  .cal-body-wrap{flex-direction:column}
  .cal-sidebar{width:100%;min-width:0;border-right:0;border-bottom:1px solid #2a2010;max-height:120px;padding:8px 0;display:flex;flex-wrap:wrap;gap:4px;overflow-x:auto}
  .cal-sidebar-head{width:100%;margin-bottom:4px}
  .cal-grid{grid-auto-rows:64px}
  .cal-pill{font-size:10px;padding:2px 4px}
  .cal-month-label{font-size:13px!important;min-width:140px!important}
}
.cal-pub{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:250;display:none;place-items:center;padding:16px}
.cal-pub.open{display:grid}
.cal-pub-modal{width:min(600px,calc(100% - 32px));max-height:90vh;overflow-y:auto;background:#1e1809;border:1px solid #3a2e1a;border-radius:14px;box-shadow:0 20px 60px #000;color:#e6d9b8;font-size:14px}
.cal-pub-head{padding:14px 16px;border-bottom:1px solid #3a2e1a;display:flex;align-items:center;gap:10px}
.cal-pub-head h3{margin:0;font-family:'Cinzel',serif;font-size:16px;letter-spacing:.04em;color:#ffcb2f}
.cal-pub-body{padding:16px}
.cal-pub-section{margin-bottom:16px}
.cal-pub-label{display:block;font-size:11px;font-weight:800;color:#7a6c4a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.cal-pub-req{color:#b23a30;font-weight:700;font-size:10px}
.cal-pub-input{width:100%;background:#0d0b08;color:#e6d9b8;border:1px solid #3a2e1a;border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit;box-sizing:border-box}
.cal-pub-input:focus{border-color:#6b5836;outline:none;box-shadow:0 0 0 2px rgba(255,203,47,.12)}
.cal-pub-dates{font-size:13px;color:#a99b78;line-height:1.8}
.cal-pub-dates strong{color:#e6d9b8}
.cal-pub-preview{background:#313338;border:1px solid #3a2e1a;border-radius:8px;padding:16px;max-height:300px;overflow-y:auto;font-size:14px;word-break:break-word;line-height:1.375;color:#dbdee1;font-family:'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif}
.cal-pub-preview h1{font-size:24px;font-weight:700;margin:8px 0 4px;line-height:1.2;color:#f2f3f5}
.cal-pub-preview h2{font-size:20px;font-weight:700;margin:8px 0 4px;line-height:1.2;color:#f2f3f5}
.cal-pub-preview h3{font-size:16px;font-weight:700;margin:8px 0 4px;line-height:1.2;color:#f2f3f5}
.cal-pub-preview p{margin:0 0 4px}
.cal-pub-preview strong{color:#f2f3f5;font-weight:700}
.cal-pub-preview em{font-style:italic}
.cal-pub-preview .dc-ts{background:rgba(88,101,242,.15);color:#e0e1e5;padding:1px 4px;border-radius:3px;font-size:13px;white-space:nowrap}
.cal-pub-preview .dc-divider{border:0;border-top:1px solid #4e5058;margin:8px 0}
.cal-pub-preview .dc-spacer{height:12px}
.cal-pub-charcount{margin-top:6px;font-size:11px;text-align:right;color:#7a6c4a}
.cal-pub-charcount.warn{color:#e8a832}
.cal-pub-charcount.over{color:#b23a30;font-weight:700}
.cal-pub-overlimit{background:#1a1008;border:1px solid #3a2e1a;border-radius:8px;padding:12px;margin-top:12px}
.cal-pub-overlimit p{margin:0 0 10px;font-size:12px;color:#a99b78;line-height:1.5}
.cal-pub-overlimit-actions{display:flex;gap:8px;flex-wrap:wrap}
.cal-pub-copy{padding:8px 14px;border:1px solid #6b5836;border-radius:8px;background:#1e1809;color:#ffcb2f;font-size:12px;font-weight:700;cursor:pointer}
.cal-pub-copy:hover{border-color:#ffcb2f;background:#261f0f}
.cal-pub-schedule{padding:8px 14px;border:1px solid #3a2e1a;border-radius:8px;background:#1e1809;color:#a99b78;font-size:12px;font-weight:700;cursor:pointer}
.cal-pub-schedule:hover{border-color:#6b5836;color:#e6d9b8}
.cal-pop-btn.disabled{opacity:.4;cursor:not-allowed}
.cal-pub-media{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:flex-start}
.cal-pub-thumb{position:relative;display:inline-block}
.cal-pub-thumb img{width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #3a2e1a}
.cal-pub-thumb .cal-pub-remove{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#b23a30;color:#fff;border:none;font-size:12px;line-height:18px;text-align:center;cursor:pointer;display:none}
.cal-pub-thumb:hover .cal-pub-remove{display:block}
.cal-pub-upload{padding:6px 12px;border:1px dashed #6b5836;border-radius:8px;background:#110e07;color:#a99b78;font-size:12px;cursor:pointer;font-weight:700}
.cal-pub-upload:hover{border-color:#ffcb2f;color:#ffcb2f}
.cal-pub-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
.cal-pub-error{color:#b23a30;font-size:12px;margin-top:8px}
.cal-pub-posting{text-align:center;padding:20px;color:#7a6c4a}
.cal-confirm{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:260;display:none;place-items:center;padding:16px}
.cal-confirm.open{display:grid}
.cal-confirm-inner{background:#1e1809;border:1px solid #3a2e1a;border-radius:14px;padding:20px;max-width:420px;width:calc(100% - 32px);color:#e6d9b8;text-align:center}
.cal-confirm-inner h4{margin:0 0 12px;font-family:'Cinzel',serif;color:#ffcb2f;font-size:16px}
.cal-confirm-inner p{margin:0 0 10px;font-size:13px;line-height:1.5;color:#a99b78}
.cal-confirm-inner strong{color:#e6d9b8}
.cal-confirm-actions{display:flex;gap:8px;justify-content:center;margin-top:16px}
@media(max-width:600px){
  .cal-pub-modal{width:calc(100% - 16px)}
  .cal-pub-thumb img{width:60px;height:60px}
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

  function computeLiveStatus(ev) {
    if (ev.status === "completed") return "ended";
    const now = Date.now();
    let startMs = null;
    if (ev.startDate) {
      startMs = new Date(ev.startDate + "T" + (ev.startTime || "00:00") + ":00").getTime();
    }
    let endMs = null;
    if (ev.endDate) {
      endMs = new Date(ev.endDate + "T" + (ev.endTime || "23:59") + ":00").getTime();
    }
    if (endMs && now > endMs) return "ended";
    if (startMs && now >= startMs) return "live";
    return "upcoming";
  }

  function getMonthGrid(year, month) {
    const first = new Date(year, month, 1);
    const dow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = dow - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month - 1 < 0 ? 11 : month - 1;
      const y = month - 1 < 0 ? year - 1 : year;
      cells.push({
        day: d, month: m, year: y,
        iso: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        other: true,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d, month, year,
        iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        other: false,
      });
    }
    const rem = 7 - (cells.length % 7);
    if (rem < 7) {
      const nm = month + 1 > 11 ? 0 : month + 1;
      const ny = month + 1 > 11 ? year + 1 : year;
      for (let d = 1; d <= rem; d++) {
        cells.push({
          day: d, month: nm, year: ny,
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

  function getFilteredUnscheduled() {
    let items = calState.unscheduled;
    if (calState.filter === "live") return [];
    if (calState.search) {
      const q = calState.search.toLowerCase();
      items = items.filter((e) => e.name.toLowerCase().includes(q));
    }
    return items;
  }

  async function fetchCalendarData() {
    calState.loading = true;
    renderCalendar();

    const [ideasRes, eventsRes] = await Promise.allSettled([
      fetch("/api/ideaboard?fields=calendar").then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
    ]);

    calState.drafts = [];
    calState.unscheduled = [];
    if (ideasRes.status === "fulfilled" && ideasRes.value.ideas) {
      for (const idea of ideasRes.value.ideas) {
        const item = {
          id: idea.id,
          name: idea.title,
          startDate: idea.scheduledDate || "",
          endDate: idea.scheduledEndDate || "",
          hasTemplate: idea.hasTemplate,
          templateJson: idea.templateJson || null,
          images: idea.images || null,
          tags: idea.tags || [],
          author: idea.author || "",
          type: "draft",
        };
        if (idea.scheduledDate) {
          calState.drafts.push(item);
        } else {
          calState.unscheduled.push(item);
        }
      }
    }

    calState.live = [];
    if (eventsRes.status === "fulfilled" && eventsRes.value.events) {
      calState.live = eventsRes.value.events
        .filter((e) => e.startTime)
        .map((e) => {
          const item = {
            id: e.id,
            name: e.name,
            startDate: localDate(e.startTime),
            startTime: localTime(e.startTime),
            endDate: e.endTime ? localDate(e.endTime) : "",
            endTime: e.endTime ? localTime(e.endTime) : "",
            status: e.status,
            tags: e.tags || [],
            type: "live",
          };
          item.liveStatus = computeLiveStatus(item);
          return item;
        });
    }

    calState.loading = false;
    renderCalendar();
  }

  async function scheduleDraft(draft, newStartDate, newEndDate) {
    const code =
      calState.accessCode ||
      (typeof localStorage !== "undefined" && localStorage.getItem("mm-ideaboard-code")) ||
      "";
    if (!code) {
      calToast("Leader access code required");
      return false;
    }

    try {
      const r = await fetch("/api/ideaboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          message_id: draft.id,
          scheduled_date: newStartDate,
          scheduled_end_date: newEndDate || null,
          access_code: code,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        if (err.error === "invalid access code" || err.error === "leader access required") {
          calToast("Invalid or insufficient access code");
          return false;
        }
        calToast("Failed to schedule: " + (err.error || r.status));
        return false;
      }
      draft.startDate = newStartDate;
      draft.endDate = newEndDate || "";
      calToast("Scheduled for " + newStartDate);
      return true;
    } catch {
      calToast("Network error");
      return false;
    }
  }

  async function moveDraft(draft, newStartDate) {
    const offset = daysBetween(draft.startDate, newStartDate);
    const newEndDate = draft.endDate ? addDays(draft.endDate, offset) : "";
    return scheduleDraft(draft, newStartDate, newEndDate);
  }

  function renderCalendar() {
    const container = document.getElementById("calBody");
    if (!container) return;

    if (calState.loading) {
      container.innerHTML = '<div class="cal-loading">Loading events...</div>';
      const sidebar = document.getElementById("calSidebar");
      if (sidebar) sidebar.innerHTML = '<div class="cal-loading" style="padding:12px">...</div>';
      return;
    }

    const { year, month } = calState;
    const cells = getMonthGrid(year, month);
    const todayISO = localDate(new Date().toISOString());

    let html = "";
    for (const d of CAL_DAYS) {
      html += `<div class="cal-day-head">${d}</div>`;
    }
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
        const noTpl = isDraft && !ev.hasTemplate ? " no-template" : "";
        const pillClass = isDraft ? "draft" : (ev.liveStatus || "upcoming");
        html += `<div class="cal-pill ${pillClass}${noTpl} ${isSelected ? "selected" : ""}" ${isDraft ? 'draggable="true"' : ""} data-id="${esc(ev.id)}" data-type="${ev.type}" data-src="grid" title="${esc(ev.name)}">${esc(ev.name)}</div>`;
      }
      html += "</div>";
    }

    container.innerHTML = html;

    // Render sidebar
    const sidebar = document.getElementById("calSidebar");
    if (sidebar) {
      const unsched = getFilteredUnscheduled();
      let shtml = '<div class="cal-sidebar-head">Unscheduled (' + unsched.length + ')</div>';
      if (!unsched.length) {
        shtml += '<div class="cal-sidebar-empty">All items scheduled</div>';
      }
      for (const ev of unsched) {
        const isSelected = calState.selected && calState.selected.id === ev.id;
        const noTpl = !ev.hasTemplate ? " no-template" : "";
        shtml += `<div class="cal-pill draft${noTpl} ${isSelected ? "selected" : ""}" draggable="true" data-id="${esc(ev.id)}" data-type="draft" data-src="sidebar" title="${esc(ev.name)}">${esc(ev.name)}</div>`;
      }
      sidebar.innerHTML = shtml;
      bindSidebar();
    }

    bindGrid();
  }

  function bindSidebar() {
    const sidebar = document.getElementById("calSidebar");
    if (!sidebar) return;

    sidebar.querySelectorAll('.cal-pill[draggable="true"]').forEach((pill) => {
      pill.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", pill.dataset.id);
        e.dataTransfer.setData("cal-src", "sidebar");
        e.dataTransfer.effectAllowed = "move";
        pill.classList.add("dragging");
      });
      pill.addEventListener("dragend", () => {
        pill.classList.remove("dragging");
        document.querySelectorAll(".drop-target").forEach((c) => c.classList.remove("drop-target"));
      });
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = pill.dataset.id;
        const ev = calState.unscheduled.find((d) => d.id === id);
        if (!ev) return;
        if (calState.selected && calState.selected.id === ev.id) {
          calState.selected = null;
        } else {
          calState.selected = ev;
          calState.selected._fromSidebar = true;
        }
        closePopover();
        renderCalendar();
      });
    });
  }

  function bindGrid() {
    const container = document.getElementById("calBody");
    if (!container) return;

    container.querySelectorAll('.cal-pill[draggable="true"]').forEach((pill) => {
      pill.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", pill.dataset.id);
        e.dataTransfer.setData("cal-src", "grid");
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
        const newDate = cell.dataset.date;

        // Check if from sidebar (unscheduled)
        const fromSidebar = calState.unscheduled.find((d) => d.id === id);
        if (fromSidebar) {
          showSchedulePopover(fromSidebar, newDate, cell);
          return;
        }

        // From grid (already scheduled, moving) -- show confirmation
        const draft = calState.drafts.find((d) => d.id === id);
        if (!draft) return;
        if (newDate === draft.startDate) return;
        showMoveConfirmPopover(draft, newDate, cell);
      });

      // Mobile tap-to-move
      cell.addEventListener("click", async (e) => {
        if (e.target.closest(".cal-pill")) return;
        if (!calState.selected) return;
        const newDate = cell.dataset.date;

        if (calState.selected._fromSidebar) {
          const ev = calState.selected;
          calState.selected = null;
          showSchedulePopover(ev, newDate, cell);
          return;
        }

        if (newDate === calState.selected.startDate) {
          calState.selected = null;
          renderCalendar();
          return;
        }
        const movingDraft = calState.selected;
        calState.selected = null;
        renderCalendar();
        showMoveConfirmPopover(movingDraft, newDate, cell);
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

        if (ev.type === "draft" && window.innerWidth <= 600) {
          if (calState.selected && calState.selected.id === ev.id) {
            calState.selected = null;
          } else {
            calState.selected = ev;
            calState.selected._fromSidebar = false;
          }
          closePopover();
          renderCalendar();
          return;
        }

        showPopover(ev, pill);
      });
    });
  }

  function showSchedulePopover(ev, dateStr, anchor) {
    closePopover();
    const pop = document.getElementById("calPopover");
    if (!pop) return;

    let html = `<h4>${esc(ev.name)} <span class="cal-pop-type draft">Final Approval</span></h4>`;
    html += `
      <div class="cal-pop-row"><span class="cal-pop-label">Start</span><input type="date" id="calPopDate" value="${esc(dateStr)}"></div>
      <div class="cal-pop-row"><span class="cal-pop-label">End</span><input type="date" id="calPopEndDate" value=""><span style="font-size:11px;color:#5a4d30;margin-left:4px">optional, for multi-day</span></div>
      ${!ev.hasTemplate ? '<div class="cal-pop-hint">No template attached to this card</div>' : ""}
      <div class="cal-pop-actions">
        <button class="cal-pop-btn gold" id="calPopSave">${ev.hasTemplate ? "Next: Review Post" : "Schedule"}</button>
        <button class="cal-pop-btn" id="calPopClose">Cancel</button>
      </div>`;

    pop.innerHTML = html;
    pop.classList.add("open");

    const rect = anchor.getBoundingClientRect();
    const pw = 320;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    if (left < 16) left = 16;
    if (top + 200 > window.innerHeight) top = rect.top - 220;
    if (top < 16) top = 16;
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    document.getElementById("calPopClose").onclick = closePopover;
    document.getElementById("calPopSave").onclick = async () => {
      const d = document.getElementById("calPopDate").value;
      const ed = document.getElementById("calPopEndDate").value;
      if (!d) { calToast("Start date is required"); return; }
      if (ev.hasTemplate) {
        closePopover();
        showPublishOverlay(ev, d, ed || null);
      } else {
        const ok = await scheduleDraft(ev, d, ed || null);
        if (ok) {
          closePopover();
          const idx = calState.unscheduled.indexOf(ev);
          if (idx >= 0) calState.unscheduled.splice(idx, 1);
          ev.startDate = d;
          ev.endDate = ed || "";
          calState.drafts.push(ev);
          renderCalendar();
        }
      }
    };
  }

  function showMoveConfirmPopover(draft, newDate, anchor) {
    closePopover();
    const pop = document.getElementById("calPopover");
    if (!pop) return;

    const offset = daysBetween(draft.startDate, newDate);
    const newEnd = draft.endDate ? addDays(draft.endDate, offset) : "";

    let html = `<h4>${esc(draft.name)} <span class="cal-pop-type draft">Move</span></h4>`;
    html += `<div class="cal-pop-row"><span class="cal-pop-label">From</span><span>${esc(draft.startDate)}${draft.endDate ? " to " + esc(draft.endDate) : ""}</span></div>`;
    html += `<div class="cal-pop-row"><span class="cal-pop-label">To</span><span>${esc(newDate)}${newEnd ? " to " + esc(newEnd) : ""}</span></div>`;
    html += `<div class="cal-pop-actions">
      <button class="cal-pop-btn gold" id="calPopConfirmMove">Confirm Move</button>
      <button class="cal-pop-btn" id="calPopClose">Cancel</button>
    </div>`;

    pop.innerHTML = html;
    pop.classList.add("open");

    const rect = anchor.getBoundingClientRect();
    const pw = 320;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pw > window.innerWidth - 16) left = window.innerWidth - pw - 16;
    if (left < 16) left = 16;
    if (top + 200 > window.innerHeight) top = rect.top - 220;
    if (top < 16) top = 16;
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    document.getElementById("calPopClose").onclick = closePopover;
    document.getElementById("calPopConfirmMove").onclick = async () => {
      const ok = await moveDraft(draft, newDate);
      if (ok) {
        closePopover();
        await fetchCalendarData();
      }
    };
  }

  function showPopover(ev, anchor) {
    closePopover();
    const pop = document.getElementById("calPopover");
    if (!pop) return;

    const isDraft = ev.type === "draft";
    const statusLabels = { upcoming: "Upcoming", live: "LIVE", ended: "Ended" };
    const statusClass = isDraft ? "draft" : (ev.liveStatus || "upcoming");
    const statusLabel = isDraft ? "Final Approval" : (statusLabels[ev.liveStatus] || "Event");
    let html = `<h4>${esc(ev.name)} <span class="cal-pop-type ${statusClass}">${statusLabel}</span></h4>`;

    if (isDraft) {
      html += `
        <div class="cal-pop-row"><span class="cal-pop-label">Start</span><input type="date" id="calPopDate" value="${esc(ev.startDate)}"></div>
        <div class="cal-pop-row"><span class="cal-pop-label">End</span><input type="date" id="calPopEndDate" value="${esc(ev.endDate)}"></div>
        ${!ev.hasTemplate ? '<div class="cal-pop-hint">No template attached to this card</div>' : '<div class="cal-pop-hint">Template dates will auto-update</div>'}
        <div class="cal-pop-actions">
          <button class="cal-pop-btn gold" id="calPopSave">Save</button>
          <button class="cal-pop-btn" id="calPopUnschedule">Unschedule</button>
          ${ev.hasTemplate ? '<button class="cal-pop-btn" id="calPopCopyJson" title="Copy template JSON">Copy JSON</button><button class="cal-pop-btn" id="calPopDownload" title="Download template JSON">Download</button>' : ""}
          <button class="cal-pop-btn" id="calPopClose">Cancel</button>
        </div>`;
    } else {
      html += `
        <div class="cal-pop-row"><span class="cal-pop-label">Start</span><span>${esc(ev.startDate)} ${esc(ev.startTime || "")}</span></div>
        ${ev.endDate ? `<div class="cal-pop-row"><span class="cal-pop-label">End</span><span>${esc(ev.endDate)} ${esc(ev.endTime || "")}</span></div>` : ""}
        <div class="cal-pop-row"><span class="cal-pop-label">Status</span><span>${esc(ev.status || "")}</span></div>
        <div class="cal-pop-actions"><button class="cal-pop-btn" id="calPopClose">Close</button></div>`;
    }

    pop.innerHTML = html;
    pop.classList.add("open");

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
        const ed = document.getElementById("calPopEndDate").value;
        if (!d) { calToast("Start date is required"); return; }
        const ok = await scheduleDraft(ev, d, ed || null);
        if (ok) {
          closePopover();
          await fetchCalendarData();
        }
      };
      const copyJsonBtn = document.getElementById("calPopCopyJson");
      if (copyJsonBtn) {
        copyJsonBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(ev.templateJson);
            calToast("Template JSON copied");
          } catch {
            const ta = document.createElement("textarea");
            ta.value = ev.templateJson;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            calToast("Template JSON copied");
          }
        };
      }
      const dlBtn = document.getElementById("calPopDownload");
      if (dlBtn) {
        dlBtn.onclick = () => {
          const slug = ev.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "template";
          const blob = new Blob([ev.templateJson], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = slug + ".json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          calToast("Template downloaded");
        };
      }
      const unschedBtn = document.getElementById("calPopUnschedule");
      if (unschedBtn) {
        unschedBtn.onclick = async () => {
          const ok = await scheduleDraft(ev, "", "");
          if (ok) {
            closePopover();
            // Move from scheduled to unscheduled
            const idx = calState.drafts.indexOf(ev);
            if (idx >= 0) calState.drafts.splice(idx, 1);
            ev.startDate = "";
            ev.endDate = "";
            calState.unscheduled.push(ev);
            renderCalendar();
          }
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
          <button class="cal-fbtn ${calState.filter === "draft" ? "active" : ""}" data-f="draft">Final Approval</button>
          <button class="cal-fbtn ${calState.filter === "live" ? "active" : ""}" data-f="live">Events</button>
        </div>
        <div class="cal-nav">
          <button id="calPrev" title="Previous month">&#9664;</button>
          <span class="cal-month-label">${CAL_MONTHS[month]} ${year}</span>
          <button id="calNext" title="Next month">&#9654;</button>
          <button class="cal-today" id="calToday">Today</button>
        </div>
        <div class="cal-body-wrap">
          <div class="cal-sidebar" id="calSidebar"></div>
          <div class="cal-grid-wrap">
            <div class="cal-grid" id="calBody"></div>
          </div>
        </div>
        <div class="cal-legend">
          <span><span class="cal-leg-draft"></span> Final Approval (draggable)</span>
          <span><span class="cal-leg-upcoming"></span> Upcoming</span>
          <span><span class="cal-leg-live"></span> Live</span>
          <span><span class="cal-leg-ended"></span> Ended</span>
        </div>
      </div>
      <div class="cal-popover" id="calPopover"></div>
    `;

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
      if (calState.month < 0) { calState.month = 11; calState.year--; }
      renderCalendar();
      document.querySelector(".cal-month-label").textContent = CAL_MONTHS[calState.month] + " " + calState.year;
    };
    document.getElementById("calNext").onclick = () => {
      calState.month++;
      if (calState.month > 11) { calState.month = 0; calState.year++; }
      renderCalendar();
      document.querySelector(".cal-month-label").textContent = CAL_MONTHS[calState.month] + " " + calState.year;
    };
    document.getElementById("calToday").onclick = () => {
      const now = new Date();
      calState.year = now.getFullYear();
      calState.month = now.getMonth();
      renderCalendar();
      document.querySelector(".cal-month-label").textContent = CAL_MONTHS[calState.month] + " " + calState.year;
    };

    renderCalendar();
  }

  // --- Template-to-Discord converter (mirrors EventForge output) ---

  function pubZonedUnix(date, time, tz) {
    if (!date || !time) return null;
    var p = date.split("-").map(Number), Y = p[0], M = p[1], D = p[2];
    var t = time.split(":").map(Number), h = t[0], m = t[1];
    var guess = Date.UTC(Y, M - 1, D, h, m, 0);
    for (var k = 0; k < 3; k++) {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date(guess));
      var get = function(typ) { return +parts.find(function(pp) { return pp.type === typ; }).value; };
      var asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
      guess += Date.UTC(Y, M - 1, D, h, m) - asUTC;
    }
    return Math.floor(guess / 1000);
  }

  function pubTemplateToPreview(templateJson, startDate, endDate) {
    var parsed;
    try { parsed = JSON.parse(templateJson); } catch (_) { return null; }
    var ev = (parsed.template && parsed.template.event)
      ? parsed.template.event
      : (parsed.eventforge && Array.isArray(parsed.events) && parsed.events[0])
        ? parsed.events[0]
        : parsed;
    if (!ev || !ev.blocks) return null;

    if (startDate) ev.date = startDate;
    if (endDate && endDate !== startDate) { ev.endDate = endDate; ev.multiDay = true; }
    else if (startDate) { ev.endDate = ""; ev.multiDay = false; }

    var tz = ev.timezone || "America/New_York";
    var EMOJI = { when: "\u{1F4C5}", starts: "⏳", ends: "\u{1F3C1}", world: "\u{1F30E}", meet: "\u{1F4CD}", host: "\u{1F451}", rsvp: "✅", scoring: "\u{1F4CA}", dink: "\u{1F4AC}" };
    var lem = function(k) { var v = EMOJI[k]; return v ? v + " " : ""; };

    function ipfx(b) {
      if (!b.showLabel) return "";
      var emo = b.emoji || "", title = (emo + " " + (b.label || "")).trim();
      if (b.importance === "featured") return "# " + title;
      if (b.importance === "medium") return "## " + title;
      if (b.importance === "small") return (emo + " **" + (b.label || "") + ":**").trim();
      return "### " + title;
    }

    function cok(b) {
      if (!b.visible) return false;
      if (!b.condition || b.condition === "always") return true;
      if (b.condition === "hasPrize") return ev.blocks.some(function(x) { return x.kind === "prizes" && (x.items || []).some(function(i) { return i.trim(); }); });
      if (b.condition === "hasEnd") return !!(ev.endDate || ev.endTime);
      return true;
    }

    function btt(b) {
      if (!cok(b)) return "";
      if (b.kind === "spacer") return "\n";
      if (b.kind === "divider") return "────────────";
      var head = ipfx(b), content = "";
      if (b.kind === "details") {
        var lines = [];
        if (b.world) lines.push(lem("world") + "**World:** " + b.world);
        if (b.location) lines.push(lem("meet") + "**Meet:** " + b.location);
        if (b.host) lines.push(lem("host") + "**Host:** " + b.host);
        content = lines.join("\n");
      } else if (b.kind === "requirements" || b.kind === "rules" || b.kind === "prizes") {
        content = (b.items || []).filter(function(x) { return x.trim(); })
          .map(function(x) { return x.trim().match(/^(\d+[.)]|[-•*])/) ? x : "• " + x; })
          .join("\n");
      } else if (b.kind === "gear") {
        var gl = [];
        if (b.provided) gl.push("**Provided by clan:** " + b.provided);
        if (b.value) gl.push(b.value);
        content = gl.join("\n");
      } else if (b.kind === "training") {
        var tl = [];
        if (b.name && b.name !== b.label) tl.push("**" + b.name + "**");
        var tu = pubZonedUnix(b.date, b.time, b.timezone || tz);
        if (tu) tl.push(lem("when") + "<t:" + tu + ":F>\n" + lem("starts") + "<t:" + tu + ":R>");
        if (b.world) tl.push(lem("world") + "**World:** " + b.world);
        if (b.location) tl.push(lem("meet") + "**Meet:** " + b.location);
        if (b.details) tl.push(b.details);
        content = tl.join("\n");
      } else {
        content = b.value || "";
      }
      if (!head) return content;
      if (b.importance === "small" && content && content.indexOf("\n") === -1) return head + " " + content;
      return [head, content].filter(Boolean).join("\n");
    }

    var arr = [];
    if (ev.name) arr.push("# " + ev.name);
    var su = pubZonedUnix(ev.date, ev.time || "21:00", tz);
    var multi = ev.endDate && ev.endDate !== ev.date;
    var eu = (ev.endDate || ev.endTime) ? pubZonedUnix(ev.endDate || ev.date, ev.endTime || ev.time || "21:00", tz) : null;
    if (su) {
      if (multi && eu) arr.push(lem("when") + "**When:** <t:" + su + ":D> — <t:" + eu + ":D>\n" + lem("starts") + "**Starts:** <t:" + su + ":F> (<t:" + su + ":R>)");
      else arr.push(lem("when") + "**When:** <t:" + su + ":F>\n" + lem("starts") + "**Starts:** <t:" + su + ":R>");
    }
    if (eu) arr.push(lem("ends") + "**Ends:** <t:" + eu + ":F>");
    ev.blocks.forEach(function(b) { var t = btt(b); if (t) arr.push(t); });

    var extras = [];
    if (ev.bossFilter) { var bosses = ev.bossFilterBosses || []; extras.push("**Boss:** " + (bosses.length ? bosses.join(", ") : "any")); }
    if (ev.scoring && ev.scoringConfig) extras.push(lem("scoring") + "**Scoring:** " + ev.scoringConfig);
    if (ev.rsvp) extras.push(lem("rsvp") + "**React with " + (ev.rsvpEmoji || "✅") + " if you plan to make it!**");
    if (ev.dinkNote) extras.push(lem("dink") + "*Running **Dink**? Keep it on so your drops and highlights post straight to Discord.*");
    if (extras.length) arr.push(extras.join("\n"));

    return arr.join("\n\n").trim();
  }

  // --- Publish overlay ---

  function discordToHtml(raw) {
    if (!raw) return "";
    var paras = raw.split(/\n\n+/);
    var out = [];
    paras.forEach(function(p) {
      p = p.trim();
      if (!p) return;
      if (/^─{3,}/.test(p)) { out.push('<hr class="dc-divider">'); return; }
      var lines = p.split("\n");
      var html = [];
      lines.forEach(function(ln) {
        if (ln.trim() === "") { html.push('<div class="dc-spacer"></div>'); return; }
        var h = ln.match(/^(#{1,3})\s+(.+)/);
        if (h) {
          var lvl = h[1].length;
          var txt = fmtInline(h[2]);
          html.push("<h" + lvl + ">" + txt + "</h" + lvl + ">");
          return;
        }
        html.push("<p>" + fmtInline(ln) + "</p>");
      });
      out.push(html.join(""));
    });
    return out.join('<div class="dc-spacer"></div>');
  }

  function fmtInline(s) {
    s = esc(s);
    s = s.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, function(_, epoch, flag) {
      var d = new Date(parseInt(epoch) * 1000);
      if (isNaN(d.getTime())) return '<span class="dc-ts">&lt;invalid date&gt;</span>';
      var txt = "";
      var fl = flag || "f";
      if (fl === "R") {
        var diff = Math.round((d - Date.now()) / 1000);
        var abs = Math.abs(diff);
        if (abs < 60) txt = "in a few seconds";
        else if (abs < 3600) txt = (diff > 0 ? "in " : "") + Math.round(abs/60) + " minutes" + (diff < 0 ? " ago" : "");
        else if (abs < 86400) txt = (diff > 0 ? "in " : "") + Math.round(abs/3600) + " hours" + (diff < 0 ? " ago" : "");
        else txt = (diff > 0 ? "in " : "") + Math.round(abs/86400) + " days" + (diff < 0 ? " ago" : "");
      } else if (fl === "D" || fl === "d") {
        txt = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      } else if (fl === "t") {
        txt = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      } else if (fl === "T") {
        txt = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
      } else {
        txt = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
              " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      }
      return '<span class="dc-ts">' + txt + '</span>';
    });
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return s;
  }

  var pubState = { draft: null, startDate: "", endDate: "", images: [], uploadedImages: [], posting: false, charCount: 0, rawPreview: "" };

  function ensurePubOverlays() {
    if (!document.getElementById("calPubOverlay")) {
      var d = document.createElement("div");
      d.id = "calPubOverlay";
      d.className = "cal-pub";
      document.body.appendChild(d);
    }
    if (!document.getElementById("calConfirmOverlay")) {
      var c = document.createElement("div");
      c.id = "calConfirmOverlay";
      c.className = "cal-confirm";
      document.body.appendChild(c);
    }
  }

  function showPublishOverlay(draft, startDate, endDate) {
    ensurePubOverlays();
    pubState.draft = draft;
    pubState.startDate = startDate;
    pubState.endDate = endDate || "";
    pubState.images = (draft.images || []).slice();
    pubState.uploadedImages = [];
    pubState.posting = false;

    var rawPreview = pubTemplateToPreview(draft.templateJson, startDate, endDate) || "(Could not generate preview)";
    pubState.rawPreview = rawPreview;
    pubState.charCount = rawPreview.length;
    var charClass = pubState.charCount > 2000 ? "cal-pub-charcount over" : pubState.charCount > 1800 ? "cal-pub-charcount warn" : "cal-pub-charcount";
    var htmlPreview = discordToHtml(rawPreview);

    var dateDisplay = "<strong>" + esc(startDate) + "</strong>";
    if (endDate) dateDisplay += " to <strong>" + esc(endDate) + "</strong>";

    var ov = document.getElementById("calPubOverlay");
    ov.innerHTML = '<div class="cal-pub-modal">' +
      '<div class="cal-pub-head"><h3>Post to Discord</h3><button class="cal-close" id="calPubClose">&times;</button></div>' +
      '<div class="cal-pub-body">' +
        '<div class="cal-pub-section">' +
          '<label class="cal-pub-label">Thread Title <span class="cal-pub-req">* required</span></label>' +
          '<input type="text" class="cal-pub-input" id="calPubTitle" value="' + esc(draft.name) + '" placeholder="Enter event title...">' +
        '</div>' +
        '<div class="cal-pub-section">' +
          '<label class="cal-pub-label">Dates</label>' +
          '<div class="cal-pub-dates">' + dateDisplay + '</div>' +
        '</div>' +
        '<div class="cal-pub-section">' +
          '<label class="cal-pub-label">Post Preview</label>' +
          '<div class="cal-pub-preview" id="calPubPreview">' + htmlPreview + '</div>' +
          '<div class="' + charClass + '" id="calPubCharCount">' + pubState.charCount + ' / 2,000' + (pubState.charCount > 2000 ? ' (too long for bot to post)' : '') + '</div>' +
        '</div>' +
        '<div class="cal-pub-section">' +
          '<label class="cal-pub-label">Media <span class="cal-pub-req">* at least 1 image</span></label>' +
          '<div class="cal-pub-media" id="calPubMedia"></div>' +
          '<button class="cal-pub-upload" id="calPubUploadBtn">+ Upload Image</button>' +
          '<input type="file" id="calPubFileInput" accept="image/*" style="display:none">' +
          '<div class="cal-pub-error" id="calPubError" style="display:none"></div>' +
        '</div>' +
        (pubState.charCount > 2000 ?
          '<div class="cal-pub-overlimit">' +
            '<p>Post is ' + pubState.charCount + ' chars, over Discord\'s 2,000 limit for bots. Copy the post and paste it manually with Nitro (4,000 char limit), then mark as scheduled.</p>' +
            '<div class="cal-pub-overlimit-actions">' +
              '<button class="cal-pub-copy" id="calPubCopyBtn">Copy Post</button>' +
              '<button class="cal-pub-schedule" id="calPubScheduleBtn">Schedule Only</button>' +
            '</div>' +
          '</div>' : '') +
        '<div class="cal-pub-actions">' +
          '<button class="cal-pop-btn" id="calPubCancelBtn">Cancel</button>' +
          '<button class="cal-pop-btn gold' + (pubState.charCount > 2000 ? ' disabled' : '') + '" id="calPubPostBtn"' + (pubState.charCount > 2000 ? ' disabled' : '') + '>Post to Discord</button>' +
        '</div>' +
      '</div></div>';

    ov.classList.add("open");
    renderPubMedia();

    document.getElementById("calPubClose").onclick = closePublishOverlay;
    document.getElementById("calPubCancelBtn").onclick = closePublishOverlay;
    ov.onclick = function(e) { if (e.target === ov) closePublishOverlay(); };

    document.getElementById("calPubUploadBtn").onclick = function() {
      document.getElementById("calPubFileInput").click();
    };
    document.getElementById("calPubFileInput").onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { calToast("Please select an image file"); return; }
      if (file.size > 10 * 1024 * 1024) { calToast("Image must be under 10MB"); return; }
      var reader = new FileReader();
      reader.onload = function() {
        var base64 = reader.result.split(",")[1];
        pubState.uploadedImages.push({ name: file.name, type: file.type, data: base64, preview: reader.result });
        renderPubMedia();
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    };

    document.getElementById("calPubPostBtn").onclick = function() {
      if (pubState.charCount > 2000) return;
      var title = document.getElementById("calPubTitle").value.trim();
      if (!title) { showPubError("Title is required"); return; }
      var totalImages = pubState.images.length + pubState.uploadedImages.length;
      if (totalImages === 0) { showPubError("At least one image is required"); return; }
      showConfirmOverlay(title);
    };

    var copyBtn = document.getElementById("calPubCopyBtn");
    if (copyBtn) {
      copyBtn.onclick = function() {
        var title = (document.getElementById("calPubTitle").value || "").trim();
        var text = (title ? "TITLE: " + title + "\n\n" : "") + pubState.rawPreview;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function() {
            copyBtn.textContent = "Copied!";
            setTimeout(function() { copyBtn.textContent = "Copy Post"; }, 2000);
          });
        } else {
          var ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          copyBtn.textContent = "Copied!";
          setTimeout(function() { copyBtn.textContent = "Copy Post"; }, 2000);
        }
        calToast("Post copied to clipboard");
      };
    }

    var schedBtn = document.getElementById("calPubScheduleBtn");
    if (schedBtn) {
      schedBtn.onclick = async function() {
        schedBtn.textContent = "Scheduling...";
        schedBtn.disabled = true;
        var ok = await scheduleDraft(pubState.draft, pubState.startDate, pubState.endDate || null);
        if (ok) {
          closePublishOverlay();
          calToast("Scheduled (post manually via Discord)");
          fetchCalendarData();
        } else {
          schedBtn.textContent = "Schedule Only";
          schedBtn.disabled = false;
        }
      };
    }
  }

  function renderPubMedia() {
    var container = document.getElementById("calPubMedia");
    if (!container) return;
    var html = "";
    pubState.images.forEach(function(url, i) {
      html += '<div class="cal-pub-thumb">' +
        '<img src="' + esc(url) + '" alt="Media">' +
        '<button class="cal-pub-remove" data-type="existing" data-idx="' + i + '">&times;</button>' +
        '</div>';
    });
    pubState.uploadedImages.forEach(function(img, i) {
      html += '<div class="cal-pub-thumb">' +
        '<img src="' + esc(img.preview) + '" alt="' + esc(img.name) + '">' +
        '<button class="cal-pub-remove" data-type="uploaded" data-idx="' + i + '">&times;</button>' +
        '</div>';
    });
    container.innerHTML = html;
    container.querySelectorAll(".cal-pub-remove").forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var type = btn.dataset.type;
        var idx = parseInt(btn.dataset.idx, 10);
        if (type === "existing") pubState.images.splice(idx, 1);
        else pubState.uploadedImages.splice(idx, 1);
        renderPubMedia();
      };
    });
  }

  function showPubError(msg) {
    var el = document.getElementById("calPubError");
    if (el) { el.textContent = msg; el.style.display = "block"; }
  }

  function showConfirmOverlay(title) {
    var ov = document.getElementById("calConfirmOverlay");
    if (!ov) return;
    ov.innerHTML = '<div class="cal-confirm-inner">' +
      '<h4>Confirm Post</h4>' +
      '<p>This will create a new thread in the <strong>#events</strong> channel on Discord.</p>' +
      '<p><strong>Title:</strong> ' + esc(title) + '</p>' +
      '<p style="color:#b23a30;font-weight:700">This action cannot be undone.</p>' +
      '<div class="cal-confirm-actions">' +
        '<button class="cal-pop-btn" id="calConfirmNo">Cancel</button>' +
        '<button class="cal-pop-btn gold" id="calConfirmYes">Yes, Post It</button>' +
      '</div></div>';
    ov.classList.add("open");

    document.getElementById("calConfirmNo").onclick = function() { ov.classList.remove("open"); };
    ov.onclick = function(e) { if (e.target === ov) ov.classList.remove("open"); };
    document.getElementById("calConfirmYes").onclick = function() {
      ov.classList.remove("open");
      executePublish(title);
    };
  }

  async function executePublish(title) {
    if (pubState.posting) return;
    pubState.posting = true;
    var postBtn = document.getElementById("calPubPostBtn");
    if (postBtn) { postBtn.textContent = "Posting..."; postBtn.disabled = true; }

    var code = calState.accessCode || localStorage.getItem("mm-ideaboard-code") || "";
    var user = localStorage.getItem("mm-ideaboard-user") || "";
    if (!user) {
      user = prompt("Enter your name for attribution:");
      if (!user) { pubState.posting = false; if (postBtn) { postBtn.textContent = "Post to Discord"; postBtn.disabled = false; } return; }
      localStorage.setItem("mm-ideaboard-user", user);
    }

    var payload = {
      action: "publish",
      message_id: pubState.draft.id,
      title: title,
      scheduled_date: pubState.startDate,
      scheduled_end_date: pubState.endDate || null,
      include_idea_images: pubState.images.length > 0,
      uploaded_images: pubState.uploadedImages.map(function(img) { return { name: img.name, type: img.type, data: img.data }; }),
      user: user,
      access_code: code,
    };

    try {
      var res = await fetch("/api/ideaboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) {
        calToast(data.error || "Failed to publish");
        pubState.posting = false;
        if (postBtn) { postBtn.textContent = "Post to Discord"; postBtn.disabled = false; }
        return;
      }
      closePublishOverlay();
      calToast("Posted to Discord!");
      fetchCalendarData();
    } catch (err) {
      calToast("Network error");
      pubState.posting = false;
      if (postBtn) { postBtn.textContent = "Post to Discord"; postBtn.disabled = false; }
    }
  }

  function closePublishOverlay() {
    var ov = document.getElementById("calPubOverlay");
    if (ov) ov.classList.remove("open");
    var cv = document.getElementById("calConfirmOverlay");
    if (cv) cv.classList.remove("open");
    pubState.posting = false;
  }

  function closeCalendar() {
    const ov = document.getElementById("calOverlay");
    if (ov) ov.classList.remove("open");
    closePopover();
    closePublishOverlay();
    calState.selected = null;
  }

  window.openEventCalendar = function (options) {
    options = options || {};
    injectStyles();

    if (options.accessCode) calState.accessCode = options.accessCode;

    const now = new Date();
    calState.year = now.getFullYear();
    calState.month = now.getMonth();
    calState.search = "";
    calState.filter = "all";
    calState.selected = null;
    calState.popover = null;

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

/* Event Planner (LocalStorage) - Luxury theme */

const STORAGE_KEY = "event_planner_v1";

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const safeUUID = () => {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
};

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const t = timeStr ? timeStr : "00:00";
  return new Date(`${dateStr}T${t}`);
};

const statusBadgeClass = (s) => {
  if (s === "Completed") return "ok";
  if (s === "In Progress") return "warn";
  return "";
};

const rsvpBadgeClass = (s) => {
  if (s === "Going") return "ok";
  if (s === "Maybe") return "warn";
  if (s === "Declined") return "danger";
  return "";
};

const state = {
  route: "dashboard",
  events: [],
  editingId: null,
  ui: {
    calCursor: new Date(),
    theme: "light" // default to luxury light
  }
};

/* ---------- Storage ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.events)) state.events = data.events;
    if (data.ui?.theme) state.ui.theme = data.ui.theme;
  } catch (e) {
    console.warn("Failed to load data:", e);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    events: state.events,
    ui: { theme: state.ui.theme }
  }));
}

/* ---------- Routing ---------- */
function setRoute(route) {
  state.route = route;
  $$(".nav-btn").forEach(b => b.classList.toggle("is-active", b.dataset.route === route));
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${route}`).classList.remove("hidden");
  if (route === "dashboard") renderDashboard();
  if (route === "calendar") renderCalendar();
  if (route === "create") renderEditor();
}

/* ---------- CRUD ---------- */
function newEventTemplate(dateISO=null) {
  const todayISO = toISODate(new Date());
  return {
    id: safeUUID(),
    title: "",
    date: dateISO || todayISO,
    time: "",
    location: "",
    category: "Wedding",
    status: "Planned",
    notes: "",
    expectedBudget: 0,
    tasks: [],
    guests: [],
    vendors: [],
    budgetItems: []
  };
}

function upsertEvent(ev) {
  const idx = state.events.findIndex(e => e.id === ev.id);
  if (idx >= 0) state.events[idx] = ev;
  else state.events.push(ev);
  save();
}

function deleteEvent(id) {
  state.events = state.events.filter(e => e.id !== id);
  save();
}

/* ---------- Sorting / Filtering ---------- */
function sortedEvents() {
  return [...state.events].sort((a,b) => {
    const da = parseDateTime(a.date, a.time)?.getTime() ?? 0;
    const db = parseDateTime(b.date, b.time)?.getTime() ?? 0;
    return da - db;
  });
}

function upcomingWithin(days) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return sortedEvents().filter(e => {
    const dt = parseDateTime(e.date, e.time);
    return dt && dt >= now && dt <= end;
  });
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const search = ($("#searchInput").value || "").trim().toLowerCase();
  const cat = $("#categoryFilter").value;
  const stat = $("#statusFilter").value;

  const list = $("#eventsList");
  list.innerHTML = "";

  let events = sortedEvents();

  if (cat !== "all") events = events.filter(e => e.category === cat);
  if (stat !== "all") events = events.filter(e => e.status === stat);

  if (search) {
    events = events.filter(e => {
      const blob = `${e.title} ${e.location} ${e.notes}`.toLowerCase();
      return blob.includes(search);
    });
  }

  const now = new Date();
  $("#upcomingCount").textContent = `${events.length} event${events.length===1?"":"s"}`;

  if (!events.length) {
    list.innerHTML = `<div class="muted">No events match your filters.</div>`;
  } else {
    for (const ev of events) {
      const dt = parseDateTime(ev.date, ev.time);
      const isPast = dt && dt < now;
      const taskDone = ev.tasks.filter(t => t.done).length;
      const taskTotal = ev.tasks.length;
      const taskPct = taskTotal ? Math.round((taskDone/taskTotal)*100) : 0;

      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item-main">
          <div class="item-title">
            <span>${escapeHtml(ev.title || "(Untitled event)")}</span>
            <span class="badge">${escapeHtml(ev.category)}</span>
            <span class="badge ${statusBadgeClass(ev.status)}">${escapeHtml(ev.status)}</span>
            ${isPast ? `<span class="badge danger">Past</span>` : ``}
          </div>
          <div class="item-meta">
            ${escapeHtml(formatWhenWhere(ev))}
            • Tasks: ${taskDone}/${taskTotal} (${taskPct}%)
          </div>
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-action="open" data-id="${ev.id}" type="button" title="Open">Open</button>
          <button class="icon-btn" data-action="edit" data-id="${ev.id}" type="button" title="Edit">Edit</button>
        </div>
      `;
      list.appendChild(el);
    }
  }

  $("#statTotal").textContent = state.events.length;
  $("#statUpcoming").textContent = upcomingWithin(30).length;

  const avgTaskPct = (() => {
    if (!state.events.length) return 0;
    const sum = state.events.reduce((acc, e) => {
      const total = e.tasks.length || 0;
      const done = e.tasks.filter(t => t.done).length;
      return acc + (total ? (done/total) : 0);
    }, 0);
    return Math.round((sum / state.events.length) * 100);
  })();
  $("#statTasks").textContent = `${avgTaskPct}%`;

  const next = upcomingWithin(3650)[0];
  if (!next) {
    $("#nextUp").textContent = "No upcoming events — create one!";
  } else {
    const taskDone = next.tasks.filter(t => t.done).length;
    const taskTotal = next.tasks.length;
    $("#nextUp").innerHTML = `
      <div><strong>${escapeHtml(next.title || "(Untitled)")}</strong></div>
      <div>${escapeHtml(formatWhenWhere(next))}</div>
      <div>Tasks: ${taskDone}/${taskTotal}</div>
      <div>Expected budget: ${escapeHtml(fmtMoney(next.expectedBudget))}</div>
    `;
  }
}

/* ---------- Calendar ---------- */
function renderCalendar() {
  const d = new Date(state.ui.calCursor);
  const year = d.getFullYear();
  const month = d.getMonth();

  const monthName = d.toLocaleString(undefined, { month: "long" });
  $("#monthLabel").textContent = `${monthName} ${year}`;

  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const start = new Date(year, month, 1 - startDow);

  const grid = $("#calendarGrid");
  grid.innerHTML = "";

  const todayISO = toISODate(new Date());

  for (let i=0; i<42; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const iso = toISODate(day);
    const inMonth = day.getMonth() === month;

    const dayEvents = state.events
      .filter(e => e.date === iso)
      .sort((a,b) => (a.time||"").localeCompare(b.time||""));

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `day ${inMonth ? "" : "out"}`;
    cell.setAttribute("data-date", iso);
    cell.setAttribute("aria-label", `Day ${iso}`);
    cell.innerHTML = `
      <div class="daynum">
        <span>${day.getDate()}</span>
        ${iso === todayISO ? `<span class="dot" title="Today"></span>` : `<span></span>`}
      </div>
      <div class="day-events">
        ${dayEvents.slice(0,3).map(ev => `
          <div class="day-event" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title || "(Untitled)")}</div>
        `).join("")}
        ${dayEvents.length > 3 ? `<div class="muted" style="font-size:12px;">+${dayEvents.length-3} more</div>` : ""}
      </div>
    `;
    cell.addEventListener("click", () => {
      state.editingId = null;
      setRoute("create");
      fillEditor(newEventTemplate(iso));
    });

    grid.appendChild(cell);
  }
}

/* ---------- Editor ---------- */
let editorCache = null;

function fillEditor(ev) {
  editorCache = structuredClone(ev);
  $("#eventId").value = ev.id;
  $("#titleInput").value = ev.title || "";
  $("#dateInput").value = ev.date || toISODate(new Date());
  $("#timeInput").value = ev.time || "";
  $("#locationInput").value = ev.location || "";
  $("#categoryInput").value = ev.category || "Wedding";
  $("#statusInput").value = ev.status || "Planned";
  $("#notesInput").value = ev.notes || "";
  $("#budgetInput").value = ev.expectedBudget ?? 0;

  const existing = state.events.some(e => e.id === ev.id);
  $("#deleteEventBtn").style.display = existing ? "inline-flex" : "none";

  renderTasks();
  renderGuests();
  renderVendors();
  renderBudget();
  updateEditorHeader();
}

function updateEditorFromInputs() {
  if (!editorCache) editorCache = newEventTemplate();
  editorCache.id = $("#eventId").value || editorCache.id || safeUUID();
  editorCache.title = $("#titleInput").value.trim();
  editorCache.date = $("#dateInput").value;
  editorCache.time = $("#timeInput").value;
  editorCache.location = $("#locationInput").value.trim();
  editorCache.category = $("#categoryInput").value;
  editorCache.status = $("#statusInput").value;
  editorCache.notes = $("#notesInput").value.trim();
  editorCache.expectedBudget = Number($("#budgetInput").value || 0);
}

function updateEditorHeader() {
  const existing = state.events.some(e => e.id === (editorCache?.id));
  $("#formTitle").textContent = existing ? "Edit Event" : "Create Event";
  $("#editingHint").textContent = existing ? "Update details and save" : "Fill out details and save";
}

function renderEditor() {
  if (!editorCache) fillEditor(newEventTemplate());
  else updateEditorHeader();
}

/* ----- Tabs ----- */
function setTab(name) {
  $$(".tab").forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".tab-panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
}

/* ----- Tasks ----- */
function renderTasks() {
  const list = $("#tasksList");
  list.innerHTML = "";
  const tasks = editorCache?.tasks || [];
  const done = tasks.filter(t => t.done).length;
  $("#taskProgress").textContent = `${done}/${tasks.length} done`;

  if (!tasks.length) {
    list.innerHTML = `<div class="muted">No tasks yet. Add one above.</div>`;
    return;
  }

  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="check item-main">
        <input type="checkbox" ${t.done ? "checked" : ""} data-id="${t.id}" aria-label="Mark task complete" />
        <div>
          <div class="item-title" style="font-weight:700;">
            <span style="${t.done ? "text-decoration:line-through;opacity:.7;" : ""}">${escapeHtml(t.text)}</span>
          </div>
        </div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-action="remove-task" data-id="${t.id}" type="button">Remove</button>
      </div>
    `;

    $("input[type=checkbox]", row).addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const task = editorCache.tasks.find(x => x.id === id);
      task.done = e.target.checked;
      renderTasks();
    });

    $("[data-action=remove-task]", row).addEventListener("click", () => {
      editorCache.tasks = editorCache.tasks.filter(x => x.id !== t.id);
      renderTasks();
    });

    list.appendChild(row);
  }
}

/* ----- Guests ----- */
function renderGuests() {
  const list = $("#guestsList");
  list.innerHTML = "";
  const guests = editorCache?.guests || [];
  $("#guestCount").textContent = `${guests.length} guest${guests.length===1?"":"s"}`;

  if (!guests.length) {
    list.innerHTML = `<div class="muted">No guests yet. Add someone above.</div>`;
    return;
  }

  for (const g of guests) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">
          <span>${escapeHtml(g.name)}</span>
          <span class="badge ${rsvpBadgeClass(g.rsvp)}">${escapeHtml(g.rsvp)}</span>
        </div>
      </div>
      <div class="item-actions">
        <select class="icon-btn" aria-label="Change RSVP" data-id="${g.id}">
          ${["Invited","Going","Maybe","Declined"].map(s => `<option ${s===g.rsvp?"selected":""}>${s}</option>`).join("")}
        </select>
        <button class="icon-btn" data-action="remove-guest" data-id="${g.id}" type="button">Remove</button>
      </div>
    `;

    $("select", row).addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const guest = editorCache.guests.find(x => x.id === id);
      guest.rsvp = e.target.value;
      renderGuests();
    });

    $("[data-action=remove-guest]", row).addEventListener("click", () => {
      editorCache.guests = editorCache.guests.filter(x => x.id !== g.id);
      renderGuests();
    });

    list.appendChild(row);
  }
}

/* ----- Vendors ----- */
function renderVendors() {
  const list = $("#vendorsList");
  list.innerHTML = "";
  const vendors = editorCache?.vendors || [];
  $("#vendorCount").textContent = `${vendors.length} vendor${vendors.length===1?"":"s"}`;

  if (!vendors.length) {
    list.innerHTML = `<div class="muted">No vendors yet. Add one above.</div>`;
    return;
  }

  for (const v of vendors) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">
          <span>${escapeHtml(v.name || "Vendor")}</span>
          <span class="badge">${escapeHtml(v.service || "Service")}</span>
        </div>
        <div class="item-meta">
          ${escapeHtml(v.contact || "No contact")} • Est: ${escapeHtml(fmtMoney(v.cost))}
        </div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-action="remove-vendor" data-id="${v.id}" type="button">Remove</button>
      </div>
    `;

    $("[data-action=remove-vendor]", row).addEventListener("click", () => {
      editorCache.vendors = editorCache.vendors.filter(x => x.id !== v.id);
      renderVendors();
      renderBudget();
    });

    list.appendChild(row);
  }
}

/* ----- Budget ----- */
function calcSpent(ev) {
  const items = (ev.budgetItems || []).reduce((a,x) => a + Number(x.amount||0), 0);
  const vendors = (ev.vendors || []).reduce((a,x) => a + Number(x.cost||0), 0);
  return items + vendors;
}

function renderBudget() {
  const list = $("#budgetList");
  list.innerHTML = "";
  const items = editorCache?.budgetItems || [];
  const spent = calcSpent(editorCache || {});
  const expected = Number(editorCache?.expectedBudget || 0);
  const remaining = expected - spent;

  $("#expectedBudget").textContent = fmtMoney(expected);
  $("#spentBudget").textContent = fmtMoney(spent);
  $("#remainingBudget").textContent = fmtMoney(remaining);
  $("#budgetSummary").textContent = `Spent ${fmtMoney(spent)} (includes vendor estimates)`;

  if (!items.length) {
    list.innerHTML = `<div class="muted">No budget items yet. Vendors also count toward “Spent”.</div>`;
    return;
  }

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">
          <span>${escapeHtml(it.name || "Item")}</span>
        </div>
        <div class="item-meta">${escapeHtml(fmtMoney(it.amount))}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-action="remove-budget" data-id="${it.id}" type="button">Remove</button>
      </div>
    `;

    $("[data-action=remove-budget]", row).addEventListener("click", () => {
      editorCache.budgetItems = editorCache.budgetItems.filter(x => x.id !== it.id);
      renderBudget();
    });

    list.appendChild(row);
  }
}

/* ---------- Modal ---------- */
function openModal(eventId) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;

  $("#modalTitle").textContent = ev.title || "(Untitled event)";

  const tasksDone = ev.tasks.filter(t => t.done).length;
  const tasksTotal = ev.tasks.length;

  const going = ev.guests.filter(g => g.rsvp === "Going").length;
  const maybe = ev.guests.filter(g => g.rsvp === "Maybe").length;
  const invited = ev.guests.filter(g => g.rsvp === "Invited").length;
  const declined = ev.guests.filter(g => g.rsvp === "Declined").length;

  const spent = calcSpent(ev);
  const expected = Number(ev.expectedBudget || 0);
  const remaining = expected - spent;

  $("#modalBody").innerHTML = `
    <div class="pill" style="display:inline-flex;gap:10px;align-items:center;margin-bottom:10px;">
      <span class="badge">${escapeHtml(ev.category)}</span>
      <span class="badge ${statusBadgeClass(ev.status)}">${escapeHtml(ev.status)}</span>
    </div>

    <p><strong>When:</strong> ${escapeHtml(formatWhen(ev))}</p>
    <p><strong>Where:</strong> ${escapeHtml(ev.location || "—")}</p>

    <div class="divider"></div>

    <p><strong>Tasks:</strong> ${tasksDone}/${tasksTotal} completed</p>
    <p><strong>Guests:</strong> Going ${going}, Maybe ${maybe}, Invited ${invited}, Declined ${declined}</p>

    <div class="divider"></div>

    <p><strong>Budget:</strong> Expected ${escapeHtml(fmtMoney(expected))}, Spent ${escapeHtml(fmtMoney(spent))}, Remaining ${escapeHtml(fmtMoney(remaining))}</p>
    <p><strong>Notes:</strong><br/>${escapeHtml(ev.notes || "—").replaceAll("\n","<br/>")}</p>
  `;

  $("#modalEditBtn").onclick = () => {
    state.editingId = ev.id;
    setRoute("create");
    fillEditor(structuredClone(ev));
  };

  $("#eventModal").showModal();
}

/* ---------- Helpers ---------- */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatWhen(ev) {
  const dt = parseDateTime(ev.date, ev.time);
  if (!dt) return "—";
  const datePart = dt.toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric" });
  const timePart = ev.time ? dt.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" }) : "";
  return timePart ? `${datePart} • ${timePart}` : datePart;
}

function formatWhenWhere(ev) {
  const when = formatWhen(ev);
  const where = ev.location ? ev.location : "No location";
  return `${when} • ${where}`;
}

/* ---------- Wire UI ---------- */
function wire() {
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });

  $("#searchInput").addEventListener("input", renderDashboard);
  $("#categoryFilter").addEventListener("change", renderDashboard);
  $("#statusFilter").addEventListener("change", renderDashboard);

  $("#quickAddBtn").addEventListener("click", () => {
    state.editingId = null;
    setRoute("create");
    fillEditor(newEventTemplate());
  });

  $("#eventsList").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (!id || !action) return;

    if (action === "open") openModal(id);
    if (action === "edit") {
      const ev = state.events.find(x => x.id === id);
      if (!ev) return;
      state.editingId = id;
      setRoute("create");
      fillEditor(structuredClone(ev));
    }
  });

  $("#prevMonthBtn").addEventListener("click", () => {
    const d = new Date(state.ui.calCursor);
    d.setMonth(d.getMonth() - 1);
    state.ui.calCursor = d;
    renderCalendar();
  });
  $("#nextMonthBtn").addEventListener("click", () => {
    const d = new Date(state.ui.calCursor);
    d.setMonth(d.getMonth() + 1);
    state.ui.calCursor = d;
    renderCalendar();
  });
  $("#todayBtn").addEventListener("click", () => {
    state.ui.calCursor = new Date();
    renderCalendar();
  });

  $$(".tab").forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

  $("#addTaskBtn").addEventListener("click", () => {
    const text = $("#taskText").value.trim();
    if (!text) return;
    editorCache.tasks.push({ id: safeUUID(), text, done: false });
    $("#taskText").value = "";
    renderTasks();
  });

  $("#addGuestBtn").addEventListener("click", () => {
    const name = $("#guestName").value.trim();
    const rsvp = $("#guestRsvp").value;
    if (!name) return;
    editorCache.guests.push({ id: safeUUID(), name, rsvp });
    $("#guestName").value = "";
    $("#guestRsvp").value = "Invited";
    renderGuests();
  });

  $("#addVendorBtn").addEventListener("click", () => {
    const name = $("#vendorName").value.trim();
    const service = $("#vendorService").value.trim();
    const contact = $("#vendorContact").value.trim();
    const cost = Number($("#vendorCost").value || 0);
    if (!name && !service && !contact && !cost) return;

    editorCache.vendors.push({ id: safeUUID(), name, service, contact, cost });
    $("#vendorName").value = "";
    $("#vendorService").value = "";
    $("#vendorContact").value = "";
    $("#vendorCost").value = "";
    renderVendors();
    renderBudget();
  });

  $("#addBudgetItemBtn").addEventListener("click", () => {
    const name = $("#budgetItemName").value.trim();
    const amount = Number($("#budgetItemAmount").value || 0);
    if (!name && !amount) return;

    editorCache.budgetItems.push({ id: safeUUID(), name, amount });
    $("#budgetItemName").value = "";
    $("#budgetItemAmount").value = "";
    renderBudget();
  });

  $("#cancelEditBtn").addEventListener("click", () => {
    editorCache = null;
    state.editingId = null;
    setRoute("dashboard");
  });

  $("#saveEventBtn").addEventListener("click", () => {
    updateEditorFromInputs();
    if (!editorCache.title) {
      alert("Please enter a title.");
      $("#titleInput").focus();
      return;
    }
    if (!editorCache.date) {
      alert("Please select a date.");
      $("#dateInput").focus();
      return;
    }
    upsertEvent(structuredClone(editorCache));
    editorCache = null;
    state.editingId = null;
    setRoute("dashboard");
  });

  $("#deleteEventBtn").addEventListener("click", () => {
    const id = $("#eventId").value;
    if (!id) return;
    const ev = state.events.find(e => e.id === id);
    const name = ev?.title || "this event";
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deleteEvent(id);
    editorCache = null;
    state.editingId = null;
    setRoute("dashboard");
  });

  $("#exportBtn").addEventListener("click", () => {
    const data = { exportedAt: new Date().toISOString(), events: state.events };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-planner-export-${toISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const events = Array.isArray(json.events) ? json.events : [];
      if (!events.length) {
        alert("No events found in this file.");
        return;
      }
      if (!confirm(`Import ${events.length} event(s)? This will merge with your existing events.`)) return;

      const byId = new Map(state.events.map(ev => [ev.id, ev]));
      for (const ev of events) {
        if (!ev.id) ev.id = safeUUID();
        byId.set(ev.id, ev);
      }
      state.events = [...byId.values()];
      save();
      renderDashboard();
      alert("Import complete.");
      $("#importFile").value = "";
    } catch (err) {
      console.error(err);
      alert("Import failed. Please choose a valid JSON export file.");
    }
  });

  $("#clearAllBtn").addEventListener("click", () => {
    if (!confirm("Clear ALL data? This cannot be undone.")) return;
    state.events = [];
    editorCache = null;
    save();
    renderDashboard();
    alert("All data cleared.");
  });

  $("#darkModeBtn").addEventListener("click", () => {
    state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
    applyTheme();
    save();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (state.route !== "dashboard") setRoute("dashboard");
      $("#searchInput").focus();
    }
  });
}

/* ---------- Theme ---------- */
function applyTheme() {
  const root = document.documentElement;
  const isDark = state.ui.theme === "dark";
  root.classList.toggle("dark", isDark);

  $("#darkModeBtn").setAttribute("aria-pressed", isDark ? "true" : "false");
  $("#darkModeBtn").textContent = isDark ? "◑" : "◐";
}

/* ---------- Init ---------- */
function init() {
  load();
  applyTheme();
  wire();
  setRoute("dashboard");
  setTab("tasks");
}

init();

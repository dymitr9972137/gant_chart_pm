"use client";

import { FormEvent, useMemo, useState } from "react";

type Status = "To do" | "In progress" | "Done";
type DurationUnit = "hours" | "days";
type ColumnKey = "id" | "name" | "developer" | "created" | "original" | "current" | "scope" | "start" | "duration" | "end" | "complete" | "status" | "notes";
type CustomColumnType = "text" | "number" | "date" | "checkbox";
type CustomColumn = { id: string; name: string; type: CustomColumnType; visible: boolean };
type CustomValue = string | number | boolean;
type ScopeEntry = { date: string; oldScope: number; newScope: number; reason?: string };
type Task = {
  id: string;
  name: string;
  developer: string;
  created: string;
  original: number;
  current: number;
  start: string;
  duration: number;
  durationUnit: DurationUnit;
  end: string;
  complete: number;
  status: Status;
  notes: string;
  custom?: Record<string, CustomValue>;
  scopeHistory: ScopeEntry[];
};

const DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const parseDate = (date: string) => new Date(`${date}T00:00:00`).getTime();
const toISO = (date: Date) => date.toISOString().slice(0, 10);
const formatDate = (date: string) => date ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`)) : "—";
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value || 0));
const calculateEndDate = (start: string, duration: number, unit: DurationUnit) => {
  if (!start) return "";
  const workingDays = Math.max(1, Math.ceil(unit === "hours" ? duration / 8 : duration));
  const date = new Date(`${start}T12:00:00`);
  let counted = 0;
  while (counted < workingDays) {
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) counted += 1;
    if (counted < workingDays) date.setDate(date.getDate() + 1);
  }
  return toISO(date);
};

const columnOptions: { key: ColumnKey; label: string }[] = [
  { key: "id", label: "Ticket ID" }, { key: "name", label: "Task name" }, { key: "developer", label: "Developer" },
  { key: "created", label: "Date created" }, { key: "original", label: "Original estimate" }, { key: "current", label: "Current scope" },
  { key: "scope", label: "Scope change %" }, { key: "start", label: "Start date" }, { key: "duration", label: "Duration" },
  { key: "end", label: "End date" }, { key: "complete", label: "% Complete" }, { key: "status", label: "Status" }, { key: "notes", label: "Notes" },
];

type SeedTask = { id: string; name: string; developer: string; estimate: number; priority: "Highest" | "High" | "Medium" | "Low"; milestone: "Planning" | "Design" | "Build" | "Launch"; status?: Status; blocked?: boolean; note?: string };

const planningStart = "2026-08-03";
const resourceCapacity: Record<string, { hoursPerWeek: number; availableFrom: string; availableUntil?: string; augustDailyHours?: number; totalHours?: number }> = {
  "Alex Morgan": { hoursPerWeek: 40, availableFrom: planningStart },
  "Maya Chen": { hoursPerWeek: 40, availableFrom: planningStart },
  "Jordan Lee": { hoursPerWeek: 40, availableFrom: planningStart },
  "Taylor Kim": { hoursPerWeek: 20, availableFrom: planningStart },
};
const nextWorkingDay = (date: string) => {
  const next = new Date(`${date}T12:00:00`);
  do next.setDate(next.getDate() + 1); while (next.getDay() === 0 || next.getDay() === 6);
  return toISO(next);
};

const phaseTwoBacklog: SeedTask[] = [
  { id: "PLAN-101", name: "Define product requirements", developer: "Alex Morgan", estimate: 12, priority: "Highest", milestone: "Planning", status: "Done", note: "Goals and acceptance criteria agreed with stakeholders." },
  { id: "PLAN-102", name: "Create user flows and wireframes", developer: "Maya Chen", estimate: 24, priority: "High", milestone: "Design", status: "Done" },
  { id: "PLAN-103", name: "Set up application foundation", developer: "Jordan Lee", estimate: 8, priority: "High", milestone: "Build", status: "Done" },
  { id: "PLAN-104", name: "Build project dashboard", developer: "Alex Morgan", estimate: 40, priority: "High", milestone: "Build", status: "In progress" },
  { id: "PLAN-105", name: "Implement reporting module", developer: "Jordan Lee", estimate: 32, priority: "Medium", milestone: "Build" },
  { id: "PLAN-106", name: "Run QA and resolve defects", developer: "Maya Chen", estimate: 24, priority: "Medium", milestone: "Launch" },
  { id: "PLAN-107", name: "Prepare user documentation", developer: "Taylor Kim", estimate: 12, priority: "Low", milestone: "Launch" },
  { id: "PLAN-108", name: "Production release", developer: "Taylor Kim", estimate: 8, priority: "High", milestone: "Launch", blocked: true, note: "Waiting for final release approval." },
];

const buildInitialTasks = (seeds: SeedTask[]): Task[] => {
  const cursors: Record<string, { date: string; used: number }> = {};
  return seeds.map((seed) => {
    if (!seed.developer || seed.developer === "Unassigned") return {
      id: seed.id, name: seed.name, developer: "", created: planningStart,
      original: seed.estimate, current: seed.estimate, start: "", duration: seed.estimate, durationUnit: "hours", end: "",
      complete: 0, status: "To do", notes: [seed.blocked ? "BLOCKED: more information required." : "", seed.note].filter(Boolean).join(" "),
      custom: { "custom-priority": seed.priority, "custom-milestone": seed.milestone, "custom-blocker": Boolean(seed.blocked), "custom-capacity": "0h assigned", "custom-available": "Not scheduled" }, scopeHistory: [],
    };
    const capacity = resourceCapacity[seed.developer] ?? { hoursPerWeek: 40, availableFrom: planningStart };
    const isHigh = seed.priority === "High";
    const dailyCapacity = isHigh ? (capacity.augustDailyHours ?? capacity.hoursPerWeek / 5) : 8;
    const scheduleGroup = isHigh ? "High" : seed.priority === "Highest" ? "Highest" : "Later";
    const cursorKey = `${scheduleGroup}:${seed.developer}`;
    const defaultStart = isHigh ? capacity.availableFrom : scheduleGroup === "Highest" ? planningStart : "2026-09-01";
    const cursor = cursors[cursorKey] ?? { date: defaultStart, used: 0 };
    const start = cursor.date;
    let date = cursor.date;
    let used = cursor.used;
    let remaining = Math.max(1, seed.estimate);
    while (remaining > 0) {
      const booked = Math.min(dailyCapacity - used, remaining);
      used += booked;
      remaining -= booked;
      if (used === dailyCapacity && remaining > 0) { date = nextWorkingDay(date); used = 0; }
    }
    const end = date;
    if (used === dailyCapacity) { date = nextWorkingDay(date); used = 0; }
    cursors[cursorKey] = { date, used };
    const blockerNote = seed.blocked ? "BLOCKED: more information required." : "";
    return {
      id: seed.id, name: seed.name, developer: seed.developer, created: planningStart,
      original: seed.estimate, current: seed.estimate, start, duration: Math.max(1, seed.estimate), durationUnit: "hours", end,
      complete: 0, status: seed.status ?? "To do", notes: [blockerNote, seed.note].filter(Boolean).join(" "),
      custom: { "custom-priority": seed.priority, "custom-milestone": seed.milestone, "custom-blocker": Boolean(seed.blocked), "custom-capacity": isHigh && capacity.totalHours ? `${capacity.totalHours}h available` : `${capacity.hoursPerWeek}h/week`, "custom-available": capacity.availableUntil ?? "Ongoing" }, scopeHistory: [],
    };
  });
};

const initialTasks = buildInitialTasks(phaseTwoBacklog);
const initialCustomColumns: CustomColumn[] = [
  { id: "custom-priority", name: "Priority", type: "text", visible: true },
  { id: "custom-milestone", name: "Milestone", type: "text", visible: true },
  { id: "custom-blocker", name: "Blocker", type: "checkbox", visible: true },
  { id: "custom-capacity", name: "Owner capacity", type: "text", visible: true },
  { id: "custom-available", name: "Available until", type: "text", visible: true },
];

const emptyTask = (): Task => ({
  id: "", name: "", developer: "", created: todayISO(), original: 8, current: 8,
  start: todayISO(), duration: 1, durationUnit: "days", end: calculateEndDate(todayISO(), 1, "days"), complete: 0, status: "To do", notes: "", scopeHistory: [],
});

function Icon({ name }: { name: "plus" | "table" | "chart" | "trash" | "close" | "filter" | "clock" | "columns" | "download" }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    table: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16M10 5v14" /></>,
    chart: <><path d="M4 18V6M4 18h16" /><path d="M7 14h4V9H7zM13 14h4V5h-4z" /></>,
    trash: <><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>,
    columns: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M9 5v14M15 5v14" /></>,
    download: <><path d="M12 4v11M8 11l4 4 4-4" /><path d="M5 19h14" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const exportValue = (task: Task, key: ColumnKey) => {
  const scope = task.original ? ((task.current - task.original) / task.original) * 100 : 0;
  const values: Record<ColumnKey, string> = {
    id: task.id, name: task.name, developer: task.developer, created: task.created,
    original: `${task.original}`, current: `${task.current}`, scope: `${scope.toFixed(1)}%`, start: task.start,
    duration: `${task.duration} ${task.durationUnit}`, end: task.end, complete: `${task.complete}%`, status: task.status, notes: task.notes,
  };
  return values[key];
};
const safeFileName = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "project";
const htmlEscape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char] || char));
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const exportRange = (tasks: Task[], deadline: string) => {
  const now = parseDate(todayISO());
  const scheduled = tasks.filter((task) => task.start && task.end);
  const earliest = Math.min(...scheduled.map((task) => parseDate(task.start)), now - 7 * DAY);
  const latest = Math.max(...scheduled.map((task) => parseDate(task.end)), parseDate(deadline), now + 21 * DAY);
  const start = earliest - ((new Date(earliest).getDay() + 6) % 7) * DAY;
  const weeks = Math.max(4, Math.ceil((latest - start) / (7 * DAY)) + 1);
  return { start, end: start + weeks * 7 * DAY, weeks };
};

function exportTimelineToExcel(projectTitle: string, tasks: Task[], deadline: string, visibleColumns: Record<ColumnKey, boolean>, customColumns: CustomColumn[]) {
  const shown = columnOptions.filter((column) => visibleColumns[column.key]);
  const shownCustom = customColumns.filter((column) => column.visible);
  const range = exportRange(tasks, deadline);
  const weekStarts = Array.from({ length: range.weeks }, (_, index) => range.start + index * 7 * DAY);
  const statusColor: Record<Status, string> = { "To do": "#dfe3e1", "In progress": "#9db7f3", Done: "#8bc6a4" };
  const head = [...shown.map((column) => `<th>${htmlEscape(column.label)}</th>`), ...shownCustom.map((column) => `<th>${htmlEscape(column.name)}</th>`), ...weekStarts.map((date) => `<th>${toISO(new Date(date))}</th>`)].join("");
  const rows = tasks.map((task) => {
    const fields = shown.map((column) => `<td>${htmlEscape(exportValue(task, column.key))}</td>`).join("");
    const custom = shownCustom.map((column) => `<td>${htmlEscape(column.type === "checkbox" ? (task.custom?.[column.id] ? "Yes" : "No") : task.custom?.[column.id] ?? "")}</td>`).join("");
    const timeline = weekStarts.map((week) => {
      const active = Boolean(task.start && task.end) && parseDate(task.start) < week + 7 * DAY && parseDate(task.end) + DAY > week;
      return `<td style="text-align:center;${active ? `background:${statusColor[task.status]};font-weight:bold` : ""}">${active ? `${task.complete}%` : ""}</td>`;
    }).join("");
    return `<tr>${fields}${custom}${timeline}</tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:11px}th,td{border:1px solid #cfd5d0;padding:6px;white-space:nowrap}th{background:#17211f;color:#fff}</style></head><body><h2>${htmlEscape(projectTitle)} — Timeline</h2><p>Deadline: ${htmlEscape(deadline)} · Exported: ${todayISO()}</p><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFileName(projectTitle)}-timeline.xls`);
}

function exportTimelineToPdf(projectTitle: string, tasks: Task[], deadline: string) {
  const range = exportRange(tasks, deadline);
  const perPage = 12;
  const pages = Array.from({ length: Math.max(1, Math.ceil(tasks.length / perPage)) }, (_, index) => tasks.slice(index * perPage, (index + 1) * perPage));
  const ascii = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?").replace(/([\\()])/g, "\\$1");
  const statusColors: Record<Status, [number, number, number]> = { "To do": [0.75, 0.78, 0.76], "In progress": [0.21, 0.42, 0.9], Done: [0.18, 0.62, 0.41] };
  const content = pages.map((pageTasks, pageIndex) => {
    const commands: string[] = ["0.09 0.13 0.12 rg", `BT /F1 18 Tf 32 558 Td (${ascii(projectTitle)} - Timeline) Tj ET`, `BT /F1 9 Tf 32 541 Td (Deadline: ${ascii(deadline)}   Exported: ${todayISO()}   Page ${pageIndex + 1}/${pages.length}) Tj ET`];
    const left = 220, chartWidth = 590, top = 500, rowHeight = 32;
    for (let week = 0; week <= range.weeks; week += 1) {
      const x = left + (week / range.weeks) * chartWidth;
      commands.push("0.88 0.9 0.89 RG", `${x.toFixed(2)} ${top - pageTasks.length * rowHeight} m ${x.toFixed(2)} ${top + 22} l S`);
      if (week < range.weeks) commands.push("0.35 0.4 0.38 rg", `BT /F1 7 Tf ${(x + 3).toFixed(2)} ${top + 9} Td (${toISO(new Date(range.start + week * 7 * DAY)).slice(5)}) Tj ET`);
    }
    pageTasks.forEach((task, index) => {
      const y = top - (index + 1) * rowHeight;
      commands.push("0.92 0.93 0.92 RG", `32 ${y} m 810 ${y} l S`, "0.09 0.13 0.12 rg", `BT /F1 9 Tf 32 ${y + 12} Td (${ascii(`${task.id}  ${task.name}`.slice(0, 39))}) Tj ET`, "0.4 0.45 0.43 rg", `BT /F1 7 Tf 32 ${y + 3} Td (${ascii(`${task.developer} | ${task.status} | ${task.complete}%`.slice(0, 48))}) Tj ET`);
      if (task.start && task.end) {
        const barLeft = left + clamp((parseDate(task.start) - range.start) / (range.end - range.start) * chartWidth, 0, chartWidth);
        const barRight = left + clamp((parseDate(task.end) + DAY - range.start) / (range.end - range.start) * chartWidth, 0, chartWidth);
        const width = Math.max(3, barRight - barLeft);
        const [r, g, b] = statusColors[task.status];
        commands.push(`${r} ${g} ${b} rg`, `${barLeft.toFixed(2)} ${y + 6} ${width.toFixed(2)} 16 re f`, `${Math.max(0, r - .12)} ${Math.max(0, g - .12)} ${Math.max(0, b - .12)} rg`, `${barLeft.toFixed(2)} ${y + 6} ${(width * task.complete / 100).toFixed(2)} 16 re f`);
      }
    });
    const todayX = left + ((parseDate(todayISO()) - range.start) / (range.end - range.start)) * chartWidth;
    const deadlineX = left + ((parseDate(deadline) - range.start) / (range.end - range.start)) * chartWidth;
    if (todayX >= left && todayX <= left + chartWidth) commands.push("0.84 0.18 0.16 RG 1.5 w", `${todayX.toFixed(2)} ${top - pageTasks.length * rowHeight} m ${todayX.toFixed(2)} ${top + 22} l S`);
    if (deadlineX >= left && deadlineX <= left + chartWidth) commands.push("0.91 0.43 0.12 RG [4 3] 0 d 1.5 w", `${deadlineX.toFixed(2)} ${top - pageTasks.length * rowHeight} m ${deadlineX.toFixed(2)} ${top + 22} l S`, "[] 0 d");
    return commands.join("\n");
  });
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const kids: string[] = [];
  content.forEach((stream, index) => {
    const pageObject = 4 + index * 2, contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n", offset = pdf.length;
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) { offsets[index] = offset; const object = `${index} 0 obj\n${objects[index]}\nendobj\n`; pdf += object; offset += object.length; }
  const xref = offset;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(new Blob([pdf], { type: "application/pdf" }), `${safeFileName(projectTitle)}-timeline.pdf`);
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [projectTitle, setProjectTitle] = useState("Website launch plan");
  const [view, setView] = useState<"table" | "gantt">("gantt");
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [deadline, setDeadline] = useState("2026-09-11");
  const [availableHours, setAvailableHours] = useState(180);
  const [developerFilter, setDeveloperFilter] = useState("All developers");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customColumnOpen, setCustomColumnOpen] = useState(false);
  const [newColumn, setNewColumn] = useState<{ name: string; type: CustomColumnType }>({ name: "", type: "text" });
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(initialCustomColumns);
  const [draft, setDraft] = useState<Task>(emptyTask());
  const [scopeDraft, setScopeDraft] = useState({ newScope: 0, date: todayISO(), reason: "" });
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    id: true, name: true, developer: true, created: false, original: true, current: false, scope: false,
    start: true, duration: true, end: true, complete: true, status: true, notes: true,
  });

  const filtered = useMemo(() => tasks.filter((task) =>
    (developerFilter === "All developers" || task.developer === developerFilter) &&
    (statusFilter === "All statuses" || task.status === statusFilter)
  ), [tasks, developerFilter, statusFilter]);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const developers = [...new Set(tasks.map((task) => task.developer).filter(Boolean))].sort();
  const originalTotal = tasks.reduce((sum, task) => sum + task.original, 0);
  const currentTotal = tasks.reduce((sum, task) => sum + task.current, 0);
  const delta = currentTotal - originalTotal;
  const deltaPercent = originalTotal ? (delta / originalTotal) * 100 : 0;
  const averageComplete = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.complete, 0) / tasks.length) : 0;
  const atRisk = currentTotal > availableHours;

  const updateTask = <K extends keyof Task>(id: string, key: K, value: Task[K]) => {
    setTasks((items) => items.map((task) => task.id === id ? { ...task, [key]: value } : task));
  };
  const updateCustomValue = (taskId: string, columnId: string, value: CustomValue) => {
    setTasks((items) => items.map((task) => task.id === taskId ? { ...task, custom: { ...task.custom, [columnId]: value } } : task));
  };
  const addCustomColumn = (event: FormEvent) => {
    event.preventDefault();
    const name = newColumn.name.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    setCustomColumns((columns) => [...columns, { id, name, type: newColumn.type, visible: true }]);
    setNewColumn({ name: "", type: "text" });
    setCustomColumnOpen(false);
  };
  const updateSchedule = (id: string, start: string, duration: number, durationUnit: DurationUnit) => {
    setTasks((items) => items.map((task) => task.id === id ? {
      ...task, start, duration: Math.max(1, duration), durationUnit,
      end: calculateEndDate(start, Math.max(1, duration), durationUnit),
    } : task));
  };
  const updateDraftSchedule = (start: string, duration: number, durationUnit: DurationUnit) => {
    setDraft((task) => ({ ...task, start, duration: Math.max(1, duration), durationUnit, end: calculateEndDate(start, Math.max(1, duration), durationUnit) }));
  };
  const changeScope = (id: string, value: number, reason = "Inline scope update", date = todayISO()) => {
    setTasks((items) => items.map((task) => task.id === id && value !== task.current ? {
      ...task, current: Math.max(0, value), scopeHistory: [...task.scopeHistory, { date, oldScope: task.current, newScope: Math.max(0, value), reason }],
    } : task));
  };
  const removeTask = (id: string) => {
    if (!window.confirm(`Delete ${id}? This cannot be undone.`)) return;
    setTasks((items) => items.filter((task) => task.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (tasks.some((task) => task.id === draft.id.trim())) return;
    setTasks((items) => [...items, { ...draft, id: draft.id.trim().toUpperCase(), complete: clamp(draft.complete), current: draft.original }]);
    setDraft(emptyTask()); setAddOpen(false);
  };
  const submitScopeChange = (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    changeScope(selected.id, Number(scopeDraft.newScope), scopeDraft.reason || "Scope revised", scopeDraft.date);
    setScopeDraft({ newScope: 0, date: todayISO(), reason: "" });
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">S</span><div><strong>Scopeboard</strong><small>Project tracker</small></div></div>
        <div className="project-meta"><span className={`risk-pill ${atRisk ? "risk" : "safe"}`}><i />{atRisk ? "At risk" : "On track"}</span><input className="project-title-input" aria-label="Project title" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} /></div>
        <button className="button primary" onClick={() => setAddOpen(true)}><Icon name="plus" />Add task</button>
      </header>

      <section className="summary" aria-label="Project dashboard">
        <article><span>Original scope</span><strong>{originalTotal}<small>h</small></strong><em>Baseline estimate</em></article>
        <article><span>Current scope</span><strong>{currentTotal}<small>h</small></strong><em>Across {tasks.length} tasks</em></article>
        <article><span>Scope delta</span><strong className={delta > 0 ? "negative" : delta < 0 ? "positive" : ""}>{delta > 0 ? "+" : ""}{delta}<small>h</small></strong><em className={delta > 0 ? "negative" : delta < 0 ? "positive" : ""}>{deltaPercent > 0 ? "+" : ""}{deltaPercent.toFixed(1)}% from baseline</em></article>
        <article><span>Available capacity</span><strong className={atRisk ? "negative" : ""}>{availableHours}<small>h</small></strong><em>{atRisk ? `${currentTotal - availableHours}h over capacity` : `${availableHours - currentTotal}h buffer`}</em></article>
        <article><span>Average complete</span><strong>{averageComplete}<small>%</small></strong><div className="mini-progress"><i style={{ width: `${averageComplete}%` }} /></div></article>
      </section>

      <section className="controls">
        <div className="tabs" role="tablist">
          <button className={view === "gantt" ? "active" : ""} onClick={() => setView("gantt")}><Icon name="chart" />Gantt</button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><Icon name="table" />Tasks</button>
        </div>
        <div className="filters"><Icon name="filter" />
          <select aria-label="Filter by developer" value={developerFilter} onChange={(e) => setDeveloperFilter(e.target.value)}><option>All developers</option>{developers.map((name) => <option key={name}>{name}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All statuses</option><option>To do</option><option>In progress</option><option>Done</option></select>
        </div>
        <ColumnMenu open={columnMenuOpen} setOpen={setColumnMenuOpen} visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} customColumns={customColumns} setCustomColumns={setCustomColumns} onAddCustom={() => setCustomColumnOpen(true)} />
        <div className="exports" aria-label="Export timeline">
          <button type="button" className="button" onClick={() => exportTimelineToExcel(projectTitle, filtered, deadline, visibleColumns, customColumns)}><Icon name="download" />Excel</button>
          <button type="button" className="button" onClick={() => exportTimelineToPdf(projectTitle, filtered, deadline)}><Icon name="download" />PDF</button>
        </div>
        <div className="settings">
          <label><Icon name="clock" /><span>Deadline</span><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label><span>Available hours</span><input className="hours-input" type="number" min="0" value={availableHours} onChange={(e) => setAvailableHours(Math.max(0, Number(e.target.value)))} /></label>
        </div>
      </section>

      <section className="workspace">
        {filtered.length === 0 ? <div className="empty"><strong>No tasks match these filters</strong><span>Try a different developer or status.</span></div> : view === "gantt" ?
          <Gantt tasks={filtered} deadline={deadline} visibleColumns={visibleColumns} customColumns={customColumns} updateCustomValue={updateCustomValue} onSelect={setSelectedId} /> :
          <div className="tasks-view">
            <div className="tasks-toolbar"><div><strong>Tasks</strong><span>The same selected columns are shared with the Gantt view.</span></div></div>
            <TaskTable tasks={filtered} visibleColumns={visibleColumns} customColumns={customColumns} updateTask={updateTask} updateCustomValue={updateCustomValue} updateSchedule={updateSchedule} changeScope={changeScope} removeTask={removeTask} />
          </div>}
      </section>

      {selected && <DetailPanel task={selected} onClose={() => setSelectedId(null)} onDelete={() => removeTask(selected.id)} scopeDraft={scopeDraft} setScopeDraft={setScopeDraft} submitScopeChange={submitScopeChange} />}

      {customColumnOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCustomColumnOpen(false)}>
        <form className="modal compact-modal" onSubmit={addCustomColumn}>
          <div className="modal-head"><div><span>Custom field</span><h2>Add a task column</h2></div><button type="button" className="icon-button" onClick={() => setCustomColumnOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
          <div className="custom-column-form"><Field label="Column name"><input autoFocus required placeholder="e.g. Priority, Client, QA date" value={newColumn.name} onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value })} /></Field><Field label="Data type"><select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value as CustomColumnType })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Checkbox</option></select></Field></div>
          <div className="modal-actions"><button type="button" className="button" onClick={() => setCustomColumnOpen(false)}>Cancel</button><button className="button primary">Add column</button></div>
        </form>
      </div>}

      {addOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAddOpen(false)}>
        <form className="modal" onSubmit={addTask}>
          <div className="modal-head"><div><span>New task</span><h2>Add to project plan</h2></div><button type="button" className="icon-button" onClick={() => setAddOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
          <div className="form-grid">
            <Field label="Ticket ID"><input required placeholder="NOVA-106" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} /></Field>
            <Field label="Task name" className="span-2"><input required placeholder="Describe the deliverable" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Developer"><input required placeholder="Full name" value={draft.developer} onChange={(e) => setDraft({ ...draft, developer: e.target.value })} /></Field>
            <Field label="Date created"><input type="date" value={draft.created} onChange={(e) => setDraft({ ...draft, created: e.target.value })} /></Field>
            <Field label="Original estimate (h)"><input type="number" min="0" required value={draft.original} onChange={(e) => setDraft({ ...draft, original: Number(e.target.value) })} /></Field>
            <Field label="Start date"><input type="date" required value={draft.start} onChange={(e) => updateDraftSchedule(e.target.value, draft.duration, draft.durationUnit)} /></Field>
            <Field label="Duration"><div className="duration-control"><input type="number" min="1" required value={draft.duration} onChange={(e) => updateDraftSchedule(draft.start, Number(e.target.value), draft.durationUnit)} /><select value={draft.durationUnit} onChange={(e) => updateDraftSchedule(draft.start, draft.duration, e.target.value as DurationUnit)}><option value="hours">Hours</option><option value="days">Days</option></select></div></Field>
            <Field label="End date (auto)"><input type="date" required min={draft.start} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            <p className="schedule-hint span-3">End date is calculated using 8 hours per working day. Weekends are skipped; you can still override the result.</p>
            <Field label="% Complete"><input type="number" min="0" max="100" value={draft.complete} onChange={(e) => setDraft({ ...draft, complete: Number(e.target.value) })} /></Field>
            <Field label="Status"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}><option>To do</option><option>In progress</option><option>Done</option></select></Field>
            <Field label="Notes" className="span-3"><textarea rows={3} placeholder="Context, dependencies, or decisions" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
          </div>
          {tasks.some((task) => task.id === draft.id.trim().toUpperCase()) && <p className="form-error">That ticket ID already exists.</p>}
          <div className="modal-actions"><button type="button" className="button" onClick={() => setAddOpen(false)}>Cancel</button><button className="button primary">Add task</button></div>
        </form>
      </div>}
    </main>
  );
}

function ColumnMenu({ open, setOpen, visibleColumns, setVisibleColumns, customColumns, setCustomColumns, onAddCustom }: {
  open: boolean;
  setOpen: (value: boolean) => void;
  visibleColumns: Record<ColumnKey, boolean>;
  setVisibleColumns: (value: Record<ColumnKey, boolean>) => void;
  customColumns: CustomColumn[];
  setCustomColumns: (value: CustomColumn[]) => void;
  onAddCustom: () => void;
}) {
  const activeCount = Object.values(visibleColumns).filter(Boolean).length + customColumns.filter((column) => column.visible).length;
  return <div className="columns-menu">
    <button type="button" className="columns-trigger" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="columns" />Manage columns <b>{activeCount}</b></button>
    {open && <div className="columns-popover">
      <div className="columns-popover-head"><strong>Visible columns</strong><span>Changes appear in Gantt and Tasks immediately</span></div>
      <div className="column-list">{columnOptions.map((column) => <label key={column.key}><input type="checkbox" checked={visibleColumns[column.key]} onChange={(e) => setVisibleColumns({ ...visibleColumns, [column.key]: e.target.checked })} /><span>{column.label}</span><small>Built-in</small></label>)}</div>
      {customColumns.length > 0 && <><div className="column-divider"><span>Custom fields</span></div><div className="column-list">{customColumns.map((column) => <label key={column.id}><input type="checkbox" checked={column.visible} onChange={(e) => setCustomColumns(customColumns.map((item) => item.id === column.id ? { ...item, visible: e.target.checked } : item))} /><span>{column.name}</span><small>{column.type}</small></label>)}</div></>}
      <button type="button" className="add-custom-column" onClick={onAddCustom}><Icon name="plus" />Add custom column</button>
    </div>}
  </div>;
}

function Gantt({ tasks, deadline, visibleColumns, customColumns, updateCustomValue, onSelect }: {
  tasks: Task[];
  deadline: string;
  visibleColumns: Record<ColumnKey, boolean>;
  customColumns: CustomColumn[];
  updateCustomValue: (taskId: string, columnId: string, value: CustomValue) => void;
  onSelect: (id: string) => void;
}) {
  const now = parseDate(todayISO());
  const scheduled = tasks.filter((task) => task.start && task.end);
  const earliest = Math.min(...scheduled.map((task) => parseDate(task.start)), now - 7 * DAY);
  const latest = Math.max(...scheduled.map((task) => parseDate(task.end)), parseDate(deadline), now + 21 * DAY);
  const rangeStart = earliest - ((new Date(earliest).getDay() + 6) % 7) * DAY;
  const weeks = Math.max(4, Math.ceil((latest - rangeStart) / (7 * DAY)) + 1);
  const rangeEnd = rangeStart + weeks * 7 * DAY;
  const pct = (date: number) => ((date - rangeStart) / (rangeEnd - rangeStart)) * 100;
  const markers = [{ label: "Today", date: now, className: "today" }, { label: "Deadline", date: parseDate(deadline), className: "deadline" }];
  const shown = columnOptions.filter((column) => visibleColumns[column.key]);
  const shownCustom = customColumns.filter((column) => column.visible);
  const widths: Record<ColumnKey, number> = { id: 100, name: 190, developer: 135, created: 115, original: 90, current: 90, scope: 100, start: 115, duration: 90, end: 115, complete: 85, status: 110, notes: 210 };
  const gridTemplate = [...shown.map((column) => `${widths[column.key]}px`), ...shownCustom.map(() => "150px")].join(" ") || "100px";
  const leftWidth = Math.max(100, shown.reduce((sum, column) => sum + widths[column.key], 0) + shownCustom.length * 150);
  const displayValue = (task: Task, key: ColumnKey) => {
    const scope = task.original ? ((task.current - task.original) / task.original) * 100 : 0;
    switch (key) {
      case "id": return task.id;
      case "name": return <button className="gantt-task-link" onClick={() => onSelect(task.id)}>{task.name}</button>;
      case "developer": return task.developer;
      case "created": return formatDate(task.created);
      case "original": return `${task.original}h`;
      case "current": return `${task.current}h`;
      case "scope": return <span className={scope > 0 ? "negative" : scope < 0 ? "positive" : ""}>{scope > 0 ? "+" : ""}{scope.toFixed(1)}%</span>;
      case "start": return formatDate(task.start);
      case "duration": return `${task.duration}${task.durationUnit === "hours" ? "h" : "d"}`;
      case "end": return formatDate(task.end);
      case "complete": return `${task.complete}%`;
      case "status": return <span className={`status-badge compact ${task.status.replaceAll(" ", "-").toLowerCase()}`}>{task.status}</span>;
      case "notes": return task.notes || "—";
    }
  };
  const customEditor = (task: Task, column: CustomColumn) => {
    const value = task.custom?.[column.id];
    if (column.type === "checkbox") return <input aria-label={`${column.name} for ${task.name}`} type="checkbox" checked={Boolean(value)} onChange={(e) => updateCustomValue(task.id, column.id, e.target.checked)} />;
    return <input aria-label={`${column.name} for ${task.name}`} type={column.type} value={value === undefined ? "" : String(value)} onChange={(e) => updateCustomValue(task.id, column.id, column.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />;
  };

  return <div className="gantt" style={{ "--gantt-left": `${leftWidth}px` } as React.CSSProperties}>
    <div className="gantt-head"><div className="gantt-fields-head" style={{ gridTemplateColumns: gridTemplate }}>{shown.map((column) => <div key={column.key}>{column.label}</div>)}{shownCustom.map((column) => <div key={column.id}><span>{column.name}</span><small>{column.type}</small></div>)}</div><div className="timeline-head">{Array.from({ length: weeks }, (_, index) => { const date = new Date(rangeStart + index * 7 * DAY); return <div key={index}><strong>{index === 0 || date.getDate() <= 7 ? date.toLocaleDateString("en", { month: "short" }) : ""}</strong><span>{date.getDate()}</span></div>; })}</div></div>
    <div className="gantt-body">
      <div className="gantt-fields">{tasks.map((task) => <div className="gantt-field-row" style={{ gridTemplateColumns: gridTemplate }} key={task.id}>{shown.map((column) => <div key={column.key} data-gantt-column={column.key}>{displayValue(task, column.key)}</div>)}{shownCustom.map((column) => <div className="gantt-custom-cell" key={column.id}>{customEditor(task, column)}</div>)}</div>)}</div>
      <div className="timeline-body" style={{ "--weeks": weeks } as React.CSSProperties}>
        {markers.map((marker) => <div key={marker.label} className={`marker ${marker.className}`} style={{ left: `${pct(marker.date)}%` }}><span>{marker.label}</span></div>)}
        {tasks.map((task) => {
          if (!task.start || !task.end) return <div className="bar-row unscheduled" key={task.id} />;
          const left = clamp(pct(parseDate(task.start)), 0, 100);
          const width = Math.max(1.5, clamp(pct(parseDate(task.end) + DAY) - left, 0, 100 - left));
          const status = task.status.replaceAll(" ", "-").toLowerCase();
          return <div className="bar-row" key={task.id}><button aria-label={`Open ${task.name}`} className={`gantt-bar ${status}`} style={{ left: `${left}%`, width: `${width}%` }} onClick={() => onSelect(task.id)}><i style={{ width: `${task.complete}%` }} /><span>{task.complete >= 25 ? `${task.complete}%` : ""}</span></button></div>;
        })}
      </div>
    </div>
    <div className="legend"><span><i className="todo" />To do</span><span><i className="progress" />In progress</span><span><i className="done" />Done</span><span><i className="today-line" />Today</span><span><i className="deadline-line" />Deadline</span></div>
  </div>;
}

function TaskTable({ tasks, visibleColumns, customColumns, updateTask, updateCustomValue, updateSchedule, changeScope, removeTask }: {
  tasks: Task[];
  visibleColumns: Record<ColumnKey, boolean>;
  customColumns: CustomColumn[];
  updateTask: <K extends keyof Task>(id: string, key: K, value: Task[K]) => void;
  updateCustomValue: (taskId: string, columnId: string, value: CustomValue) => void;
  updateSchedule: (id: string, start: string, duration: number, durationUnit: DurationUnit) => void;
  changeScope: (id: string, value: number) => void;
  removeTask: (id: string) => void;
}) {
  const shown = columnOptions.filter((column) => visibleColumns[column.key]);
  const shownCustom = customColumns.filter((column) => column.visible);
  const cell = (task: Task, key: ColumnKey) => {
    const scope = task.original ? ((task.current - task.original) / task.original) * 100 : 0;
    switch (key) {
      case "id": return <input className="ticket-input" value={task.id} onChange={(e) => updateTask(task.id, "id", e.target.value)} />;
      case "name": return <input value={task.name} onChange={(e) => updateTask(task.id, "name", e.target.value)} />;
      case "developer": return <input value={task.developer} onChange={(e) => updateTask(task.id, "developer", e.target.value)} />;
      case "created": return <input type="date" value={task.created} onChange={(e) => updateTask(task.id, "created", e.target.value)} />;
      case "original": return <input className="number-input" type="number" min="0" value={task.original} onChange={(e) => updateTask(task.id, "original", Number(e.target.value))} />;
      case "current": return <input className="number-input" type="number" min="0" defaultValue={task.current} key={`${task.id}-${task.current}`} onBlur={(e) => changeScope(task.id, Number(e.target.value))} />;
      case "scope": return <span className={`scope-change ${scope > 0 ? "grew" : scope < 0 ? "shrunk" : "unchanged"}`}>{scope > 0 ? "+" : ""}{scope.toFixed(1)}%</span>;
      case "start": return <input type="date" value={task.start} onChange={(e) => updateSchedule(task.id, e.target.value, task.duration, task.durationUnit)} />;
      case "duration": return <div className="duration-cell"><input type="number" min="1" value={task.duration} onChange={(e) => updateSchedule(task.id, task.start, Number(e.target.value), task.durationUnit)} /><select aria-label={`Duration unit for ${task.id}`} value={task.durationUnit} onChange={(e) => updateSchedule(task.id, task.start, task.duration, e.target.value as DurationUnit)}><option value="hours">h</option><option value="days">d</option></select></div>;
      case "end": return <input type="date" value={task.end} min={task.start} onChange={(e) => updateTask(task.id, "end", e.target.value)} />;
      case "complete": return <div className="complete-cell"><input type="number" min="0" max="100" value={task.complete} onChange={(e) => updateTask(task.id, "complete", clamp(Number(e.target.value)))} /><span>%</span></div>;
      case "status": return <select className={`status-select ${task.status.replaceAll(" ", "-").toLowerCase()}`} value={task.status} onChange={(e) => updateTask(task.id, "status", e.target.value as Status)}><option>To do</option><option>In progress</option><option>Done</option></select>;
      case "notes": return <input className="notes-input" value={task.notes} onChange={(e) => updateTask(task.id, "notes", e.target.value)} />;
    }
  };
  const customCell = (task: Task, column: CustomColumn) => {
    const value = task.custom?.[column.id];
    if (column.type === "checkbox") return <label className="checkbox-cell"><input type="checkbox" checked={Boolean(value)} onChange={(e) => updateCustomValue(task.id, column.id, e.target.checked)} /><span>{Boolean(value) ? "Yes" : "No"}</span></label>;
    return <input type={column.type} value={value === undefined ? "" : String(value)} placeholder={column.type === "text" ? "Enter value" : undefined} onChange={(e) => updateCustomValue(task.id, column.id, column.type === "number" ? Number(e.target.value) : e.target.value)} />;
  };
  return <div className="table-wrap"><table className="dynamic-table"><thead><tr>{shown.map((column) => <th key={column.key} data-column={column.key}>{column.label}</th>)}{shownCustom.map((column) => <th key={column.id} data-column="custom"><span>{column.name}</span><small>{column.type}</small></th>)}<th /></tr></thead>
    <tbody>{tasks.map((task) => <tr key={task.id}>{shown.map((column) => <td key={column.key} data-column={column.key}>{cell(task, column.key)}</td>)}{shownCustom.map((column) => <td key={column.id} data-column="custom">{customCell(task, column)}</td>)}<td className="actions-cell"><button className="icon-button danger" aria-label={`Delete ${task.id}`} onClick={() => removeTask(task.id)}><Icon name="trash" /></button></td></tr>)}</tbody></table></div>;
}

function DetailPanel({ task, onClose, onDelete, scopeDraft, setScopeDraft, submitScopeChange }: { task: Task; onClose: () => void; onDelete: () => void; scopeDraft: { newScope: number; date: string; reason: string }; setScopeDraft: (value: { newScope: number; date: string; reason: string }) => void; submitScopeChange: (event: FormEvent) => void }) {
  const scope = task.original ? ((task.current - task.original) / task.original) * 100 : 0;
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="drawer">
    <div className="drawer-head"><div><span>{task.id}</span><h2>{task.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
    <div className="drawer-status"><span className={`status-badge ${task.status.replaceAll(" ", "-").toLowerCase()}`}>{task.status}</span><span>{task.complete}% complete</span></div>
    <div className="detail-grid"><div><span>Developer</span><strong>{task.developer}</strong></div><div><span>Created</span><strong>{formatDate(task.created)}</strong></div><div><span>Schedule</span><strong>{formatDate(task.start)} – {formatDate(task.end)}</strong></div><div><span>Duration</span><strong>{task.duration} {task.durationUnit}</strong></div><div><span>Scope</span><strong>{task.current}h <small>from {task.original}h</small></strong></div></div>
    <div className="completion-track"><i style={{ width: `${task.complete}%` }} /></div>
    <section className="notes-card"><span>Notes</span><p>{task.notes || "No notes added."}</p></section>
    <section className="history"><div className="section-title"><div><span>Scope history</span><h3>{scope > 0 ? "+" : ""}{scope.toFixed(1)}% overall</h3></div><b className={scope > 0 ? "negative" : scope < 0 ? "positive" : ""}>{task.current - task.original > 0 ? "+" : ""}{task.current - task.original}h</b></div>
      {task.scopeHistory.length ? <ol>{[...task.scopeHistory].reverse().map((entry, index) => <li key={`${entry.date}-${index}`}><i /><div><strong>{entry.oldScope}h → {entry.newScope}h</strong><span>{entry.reason || "No reason provided"}</span></div><time>{formatDate(entry.date)}</time></li>)}</ol> : <p className="no-history">No scope changes yet.</p>}
    </section>
    <form className="scope-form" onSubmit={submitScopeChange}><h3>Add scope change</h3><div><Field label="New scope (h)"><input required min="0" type="number" value={scopeDraft.newScope || ""} onChange={(e) => setScopeDraft({ ...scopeDraft, newScope: Number(e.target.value) })} /></Field><Field label="Date"><input required type="date" value={scopeDraft.date} onChange={(e) => setScopeDraft({ ...scopeDraft, date: e.target.value })} /></Field></div><Field label="Reason (optional)"><input placeholder="What changed?" value={scopeDraft.reason} onChange={(e) => setScopeDraft({ ...scopeDraft, reason: e.target.value })} /></Field><button className="button primary">Update scope</button></form>
    <button className="delete-task" onClick={onDelete}><Icon name="trash" />Delete task</button>
  </aside></div>;
}

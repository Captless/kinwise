import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface Person { id: string; name: string; color: string; active: boolean; createdAt: string; updatedAt: string }
export interface Med { id: string; personId: string; name: string; form: string; strength: string; instructions: string; notes: string; status: "active" | "paused" | "discontinued"; startDate: string; endDate: string; pillCount: number | null; createdAt: string; updatedAt: string }
export interface Schedule { id: string; medId: string; type: "daily" | "weekdays"; times: string[]; weekdays: number[]; startDate: string; endDate: string; active: boolean }
export interface Dose { id: string; medId: string; scheduleId: string; personId: string; scheduledAt: string; localDate: string; localTime: string; status: "due" | "taken" | "skipped"; confirmedAt: string; note: string }
export interface Measurement { id: string; personId: string; spo2: number; pulse: number; measuredAt: string; notes: string }

interface KinwiseDB extends DBSchema {
  people: { key: string; value: Person };
  meds: { key: string; value: Med; indexes: { "by-person": string } };
  schedules: { key: string; value: Schedule; indexes: { "by-med": string } };
  doses: { key: string; value: Dose; indexes: { "by-date": string; "by-occurrence": [string, string] } };
  measurements: { key: string; value: Measurement; indexes: { "by-person": string } };
}

let dbp: Promise<IDBPDatabase<KinwiseDB>> | null = null;
export function db(): Promise<IDBPDatabase<KinwiseDB>> {
  if (!dbp) dbp = openDB<KinwiseDB>("kinwise", 1, {
    upgrade(d) {
      d.createObjectStore("people", { keyPath: "id" });
      const meds = d.createObjectStore("meds", { keyPath: "id" });
      meds.createIndex("by-person", "personId");
      const sch = d.createObjectStore("schedules", { keyPath: "id" });
      sch.createIndex("by-med", "medId");
      const doses = d.createObjectStore("doses", { keyPath: "id" });
      doses.createIndex("by-date", "localDate");
      doses.createIndex("by-occurrence", ["scheduleId", "scheduledAt"]);
      const meas = d.createObjectStore("measurements", { keyPath: "id" });
      meas.createIndex("by-person", "personId");
    },
  });
  return dbp;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const nowISO = () => new Date().toISOString();
export const COLORS = ["#1a5c3f", "#8a5a00", "#274690", "#93326e", "#b3541e", "#5b5bd6"];
export const PRESETS: { label: string; time: string }[] = [
  { label: "Morning", time: "08:00" }, { label: "Noon", time: "12:00" },
  { label: "Evening", time: "18:00" }, { label: "Night", time: "21:00" },
];

const pad = (n: number) => String(n).padStart(2, "0");
export function toLocalDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function datePlus(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return toLocalDate(d); }

// Pure occurrence expansion over device-local dates. Testable without IndexedDB.
export interface Occurrence { scheduleId: string; medId: string; localDate: string; localTime: string; scheduledAt: string }
export function expandLocal(schedules: Schedule[], dates: string[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const s of schedules) {
    if (!s.active) continue;
    for (const date of dates) {
      if (date < s.startDate || (s.endDate && date > s.endDate)) continue;
      if (s.type === "weekdays") {
        const wd = new Date(`${date}T12:00:00`).getDay();
        if (!s.weekdays.includes(wd)) continue;
      }
      for (const t of s.times) {
        out.push({ scheduleId: s.id, medId: s.medId, localDate: date, localTime: t, scheduledAt: new Date(`${date}T${t}:00`).toISOString() });
      }
    }
  }
  return out;
}

export async function ensureDoses(fromDate: string, toDate: string): Promise<void> {
  const d = await db();
  const dates: string[] = [];
  for (let cur = fromDate; cur <= toDate; cur = toLocalDate(new Date(new Date(`${cur}T12:00:00`).getTime() + 86400e3))) dates.push(cur);
  const tx = d.transaction(["schedules", "meds", "doses"], "readwrite");
  const schedules = (await tx.objectStore("schedules").getAll()).filter((s) => s.active);
  const meds = new Map((await tx.objectStore("meds").getAll()).map((m) => [m.id, m]));
  const doseStore = tx.objectStore("doses");
  for (const o of expandLocal(schedules, dates)) {
    const med = meds.get(o.medId);
    if (!med || med.status !== "active") continue;
    if (o.localDate < med.startDate || (med.endDate && o.localDate > med.endDate)) continue;
    const exists = await doseStore.index("by-occurrence").get([o.scheduleId, o.scheduledAt]);
    if (!exists) {
      await doseStore.put({ id: uid(), medId: o.medId, scheduleId: o.scheduleId, personId: med.personId, scheduledAt: o.scheduledAt, localDate: o.localDate, localTime: o.localTime, status: "due", confirmedAt: "", note: "" });
    }
  }
  await tx.done;
}

// --- People ---
export async function listPeople(): Promise<Person[]> {
  const all = await (await db()).getAll("people");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function addPerson(name: string): Promise<Person> {
  const existing = await listPeople();
  const p: Person = { id: uid(), name: name.trim().slice(0, 60), color: COLORS[existing.length % COLORS.length], active: true, createdAt: nowISO(), updatedAt: nowISO() };
  await (await db()).put("people", p);
  return p;
}
export async function savePerson(p: Person): Promise<void> {
  p.updatedAt = nowISO();
  await (await db()).put("people", p);
}

// --- Meds + schedules ---
export async function listMeds(): Promise<Med[]> {
  const all = await (await db()).getAll("meds");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function addMed(m: Omit<Med, "id" | "createdAt" | "updatedAt">, times: string[], weekdays: number[], type: "daily" | "weekdays"): Promise<Med> {
  const d = await db();
  const med: Med = { ...m, id: uid(), createdAt: nowISO(), updatedAt: nowISO() };
  const sch: Schedule = { id: uid(), medId: med.id, type, times, weekdays, startDate: m.startDate, endDate: m.endDate, active: true };
  const tx = d.transaction(["meds", "schedules"], "readwrite");
  await tx.objectStore("meds").put(med);
  await tx.objectStore("schedules").put(sch);
  await tx.done;
  return med;
}
export async function setMedStatus(id: string, status: Med["status"]): Promise<void> {
  const d = await db();
  const tx = d.transaction(["meds", "schedules"], "readwrite");
  const med = await tx.objectStore("meds").get(id);
  if (!med) return;
  med.status = status; med.updatedAt = nowISO();
  await tx.objectStore("meds").put(med);
  if (status !== "active") {
    for (const s of await tx.objectStore("schedules").index("by-med").getAll(id)) {
      s.active = false;
      await tx.objectStore("schedules").put(s);
    }
  }
  await tx.done;
}

// --- Doses ---
export async function dosesOn(date: string): Promise<Dose[]> {
  const all = await (await db()).getAllFromIndex("doses", "by-date", date);
  return all.sort((a, b) => a.localTime.localeCompare(b.localTime));
}
export async function confirmDose(id: string, status: "taken" | "skipped", note = ""): Promise<void> {
  const d = await db();
  const dose = await d.get("doses", id);
  if (!dose) return;
  dose.status = status; dose.confirmedAt = nowISO(); dose.note = note;
  await d.put("doses", dose);
}
export async function reopenDose(id: string): Promise<void> {
  const d = await db();
  const dose = await d.get("doses", id);
  if (!dose) return;
  dose.status = "due"; dose.confirmedAt = "";
  await d.put("doses", dose);
}
export async function doseHistory(from: string, to: string, personId: string): Promise<Dose[]> {
  const d = await db();
  const out: Dose[] = [];
  for (let cur = from; cur <= to; cur = toLocalDate(new Date(new Date(`${cur}T12:00:00`).getTime() + 86400e3))) {
    for (const dose of await d.getAllFromIndex("doses", "by-date", cur)) {
      if (!personId || dose.personId === personId) out.push(dose);
    }
  }
  return out.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 300);
}

export interface Adherence { total: number; taken: number; rate: number; pattern: string }
export async function adherence(days = 7): Promise<Adherence> {
  const from = datePlus(-(days - 1));
  const to = toLocalDate(new Date());
  const now = new Date().toISOString();
  const doses = (await doseHistory(from, to, "")).filter((x) => x.scheduledAt <= now);
  const total = doses.length;
  const taken = doses.filter((x) => x.status === "taken").length;
  const buckets: Record<string, { total: number; missed: number }> = { morning: { total: 0, missed: 0 }, midday: { total: 0, missed: 0 }, evening: { total: 0, missed: 0 }, night: { total: 0, missed: 0 } };
  for (const x of doses) {
    const h = Number(x.localTime.slice(0, 2));
    const b = h < 11 ? "morning" : h < 15 ? "midday" : h < 19 ? "evening" : "night";
    buckets[b].total++;
    if (x.status !== "taken") buckets[b].missed++;
  }
  let pattern = "Not enough doses yet for a pattern.";
  let worst = "";
  let worstRate = 0;
  for (const [k, v] of Object.entries(buckets)) {
    if (v.total >= 2 && v.missed / v.total > worstRate) { worstRate = v.missed / v.total; worst = k; }
  }
  if (worst && total >= 3) pattern = `Most missed in the ${worst} (${Math.round(worstRate * 100)} percent missed). Consider moving those doses.`;
  else if (total >= 3) pattern = "No weak time of day. Steady schedule.";
  return { total, taken, rate: total ? taken / total : 1, pattern };
}

// --- Measurements ---
export async function addMeasurement(m: Omit<Measurement, "id">): Promise<Measurement> {
  const row: Measurement = { ...m, id: uid() };
  await (await db()).put("measurements", row);
  return row;
}
export async function listMeasurements(personId: string, limit = 100): Promise<Measurement[]> {
  const d = await db();
  const all = personId ? await d.getAllFromIndex("measurements", "by-person", personId) : await d.getAll("measurements");
  return all.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)).slice(0, limit);
}

// --- Backup ---
export async function exportJSON(): Promise<string> {
  const d = await db();
  return JSON.stringify({
    exportedAt: nowISO(),
    people: await d.getAll("people"),
    meds: await d.getAll("meds"),
    schedules: await d.getAll("schedules"),
    doses: await d.getAll("doses"),
    measurements: await d.getAll("measurements"),
  }, null, 2);
}
export async function importJSON(text: string): Promise<void> {
  const data = JSON.parse(text) as Record<string, { id: string }[]>;
  const d = await db();
  const tx = d.transaction(["people", "meds", "schedules", "doses", "measurements"], "readwrite");
  for (const store of ["people", "meds", "schedules", "doses", "measurements"] as const) {
    await tx.objectStore(store).clear();
    for (const row of data[store] ?? []) await tx.objectStore(store).put(row as never);
  }
  await tx.done;
}

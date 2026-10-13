import { useEffect, useState } from "react";
import {
  addMeasurement, addMed, addPerson, adherence, confirmDose, datePlus, dosesOn, doseHistory,
  downloadICS, ensureDoses, exportJSON, importJSON, listMeasurements, listMeds, listPeople, listSchedules,
  reopenDose, savePerson, setMedStatus, toLocalDate, PRESETS,
  type Adherence, type Dose, type Med, type Measurement, type Person,
} from "./db";

type Tab = "today" | "meds" | "measure" | "history" | "people" | "settings";
const TABS: Tab[] = ["today", "meds", "measure", "history", "people", "settings"];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [people, setPeople] = useState<Person[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  const refresh = async () => {
    try {
      await ensureDoses(datePlus(-1), datePlus(14));
      const [p, m, d] = await Promise.all([listPeople(), listMeds(), dosesOn(toLocalDate(new Date()))]);
      setPeople(p.filter((x) => x.active)); setMeds(m); setDoses(d);
      const now = new Date().toISOString();
      const due = d.filter((x) => x.status === "due" && x.scheduledAt <= now).length;
      setDueCount(due);
      document.title = due > 0 ? `(${due}) Kinwise` : "Kinwise";
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(() => { setTick((x) => x + 1); refresh(); }, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { refresh(); }, [tab]);

  const go = (t: Tab) => { setTab(t); setErr(""); };
  const names = new Map(people.map((p) => [p.id, p]));
  const medNames = new Map(meds.map((m) => [m.id, m.name]));
  void tick;

  return (
    <div className="shell">
      <header className="topbar"><div className="brand">Kinwise</div><div className="small" style={{ color: "#fff", opacity: 0.8 }}>Family med scheduler</div></header>
      <aside className="sidebar">
        <div className="brand">Kinwise</div>
        <div className="tag">Family med scheduler</div>
        <nav>{TABS.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>{t}</button>)}</nav>
      </aside>
      <main className="content">
        {err && <p className="err">{err}</p>}
        {dueCount > 0 && tab !== "today" && <div className="card flat"><strong>{dueCount} dose{dueCount > 1 ? "s" : ""} waiting.</strong> <button className="ghost" style={{ width: "auto", margin: "8px 0 0" }} onClick={() => go("today")}>Open Today</button></div>}
        {tab === "today" && <Today doses={doses} names={names} medNames={medNames} reload={refresh} />}
        {tab === "meds" && <Meds meds={meds} people={people} names={names} reload={refresh} />}
        {tab === "measure" && <Measure people={people} reload={refresh} />}
        {tab === "history" && <History people={people} names={names} medNames={medNames} />}
        {tab === "people" && <People reload={refresh} />}
        {tab === "settings" && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Primary">{TABS.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>{t}</button>)}</nav>
    </div>
  );
}

function PersonTag({ p }: { p?: Person }) {
  if (!p) return <span className="chip">unknown</span>;
  return <span className="chip"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: p.color, marginRight: 6 }} />{p.name}</span>;
}

function Today({ doses, names, medNames, reload }: { doses: Dose[]; names: Map<string, Person>; medNames: Map<string, string>; reload: () => void }) {
  const now = new Date().toISOString();
  const overdue = doses.filter((d) => d.status === "due" && d.scheduledAt <= now);
  const upcoming = doses.filter((d) => !(d.status === "due" && d.scheduledAt <= now));
  const act = (fn: Promise<void>) => fn.then(reload);
  const card = (d: Dose) => (
    <div className="card" key={d.id}>
      <div className="dose">
        <div className="dose-time">{d.localTime}</div>
        <div>
          <div className="dose-name">{medNames.get(d.medId) ?? "Medication"} {d.status === "due" && d.scheduledAt <= now ? <span className="chip due">overdue</span> : <span className={`chip ${d.status}`}>{d.status}</span>}</div>
          <div style={{ margin: "4px 0" }}><PersonTag p={names.get(d.personId)} /></div>
          {d.status === "due" && (
            <div className="dose-actions">
              <button className="big" onClick={() => act(confirmDose(d.id, "taken"))}>Mark taken</button>
              <button className="ghost" onClick={() => act(confirmDose(d.id, "skipped"))}>Skip</button>
            </div>
          )}
          {d.status !== "due" && <div className="dose-actions"><button className="ghost" onClick={() => act(reopenDose(d.id))}>Undo</button></div>}
        </div>
      </div>
    </div>
  );
  return (
    <>
      <h1>Today</h1>
      <p className="muted">{overdue.length > 0 ? `${overdue.length} overdue. Start here.` : doses.length ? "All caught up for now." : "No doses scheduled. Add a medication to begin."}</p>
      {overdue.length > 0 && <><div className="section-head"><h2>Needs attention</h2></div>{overdue.map(card)}</>}
      <div className="section-head"><h2>Schedule</h2></div>
      {upcoming.map(card)}
    </>
  );
}
function PersonPicker({ people, value, onChange, onAdd }: { people: Person[]; value: string; onChange: (id: string) => void; onAdd: (p: Person) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <div>
      <label htmlFor="pp">Person</label>
      <select id="pp" value={value} onChange={(e) => { if (e.target.value === "__new") setAdding(true); else onChange(e.target.value); }}>
        <option value="">Select person</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__new">Add new person</option>
      </select>
      {adding && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New person name" />
          <button className="big" style={{ width: "auto", margin: 0 }} onClick={async () => { if (!name.trim()) return; const p = await addPerson(name); onAdd(p); onChange(p.id); setName(""); setAdding(false); }}>Add</button>
        </div>
      )}
    </div>
  );
}

function Meds({ meds, people, names, reload }: { meds: Med[]; people: Person[]; names: Map<string, Person>; reload: () => void }) {
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(["08:00"]);
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState("");
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const save = async () => {
    setMsg("");
    try {
      if (!personId) throw new Error("Choose a person first.");
      if (!name.trim()) throw new Error("Medication name is required.");
      const extra = custom.split(",").map((s) => s.trim()).filter((s) => /^\d\d:\d\d$/.test(s));
      const times = [...new Set([...picked, ...extra])].sort();
      if (!times.length) throw new Error("Pick at least one time.");
      const start = toLocalDate(new Date());
      await addMed({ personId, name: name.trim(), form: "tablet", strength: "", instructions: "", notes: "", status: "active", startDate: start, endDate: "", pillCount: null }, times, [], "daily", );
      setName(""); setCustom(""); setPicked(["08:00"]);
      await ensureDoses(start, datePlus(14));
      reload();
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h1>Medications</h1>
      <p className="muted">Pausing or discontinuing keeps past records. Nothing is deleted.</p>
      {meds.map((m) => (
        <div className="card" key={m.id}>
          <div className="dose-name">{m.name} <span className={`chip ${m.status === "active" ? "taken" : "skipped"}`}>{m.status}</span></div>
          <div style={{ margin: "4px 0 8px" }}><PersonTag p={names.get(m.personId)} /></div>
          <div className="dose-actions">
            {m.status === "active" && <button className="ghost" onClick={() => setMedStatus(m.id, "paused").then(() => ensureDoses(toLocalDate(new Date()), datePlus(14)).then(reload))}>Pause</button>}
            {m.status === "paused" && <button className="ghost" onClick={() => setMedStatus(m.id, "active").then(() => ensureDoses(toLocalDate(new Date()), datePlus(14)).then(reload))}>Resume</button>}
            {m.status !== "discontinued" && <button className="ghost danger" onClick={() => { if (confirm("Discontinue? Past records are kept.")) setMedStatus(m.id, "discontinued").then(reload); }}>Discontinue</button>}
            <button className="ghost" onClick={async () => { const s = await listSchedules(m.id); if (s[0]) downloadICS(m, s[0]); }}>Calendar file</button>
          </div>
        </div>
      ))}
      {!meds.length && <div className="empty"><h3>No medications yet</h3><p className="muted">Add the first one below.</p></div>}
      <div className="section-head"><h2>Add medication</h2></div>
      <div className="card">
        <PersonPicker people={people} value={personId} onChange={setPersonId} onAdd={reload} />
        <label htmlFor="med-name">Medication name</label>
        <input id="med-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As written on the package" />
        <label>Reminder times</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 8px" }}>
          {PRESETS.map((p) => (
            <button key={p.time} className={picked.includes(p.time) ? "big" : "ghost"} style={{ width: "auto", margin: 0, padding: "10px 14px" }} onClick={() => toggle(p.time)} aria-pressed={picked.includes(p.time)}>{p.label} {p.time}</button>
          ))}
        </div>
        <label htmlFor="med-custom">Extra times (24h, comma separated)</label>
        <input id="med-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="13:30, 22:00" />
        <button className="big" onClick={save}>Add medication</button>
        {msg && <p className="err">{msg}</p>}
      </div>
    </>
  );
}

function Measure({ people, reload }: { people: Person[]; reload: () => void }) {
  const [personId, setPersonId] = useState("");
  const [spo2, setSpo2] = useState("98");
  const [pulse, setPulse] = useState("72");
  const [msg, setMsg] = useState("");
  return (
    <>
      <h1>Record measurement</h1>
      <p className="muted">Pulse oximeter readings. Timestamp defaults to now.</p>
      <div className="card">
        <PersonPicker people={people} value={personId} onChange={setPersonId} onAdd={reload} />
        <div className="measure-grid">
          <div><label htmlFor="spo2">SpO2 percent</label><input id="spo2" value={spo2} inputMode="numeric" onChange={(e) => setSpo2(e.target.value)} /></div>
          <div><label htmlFor="pulse">Pulse (bpm)</label><input id="pulse" value={pulse} inputMode="numeric" onChange={(e) => setPulse(e.target.value)} /></div>
        </div>
        <button className="big" onClick={() => {
          const s = Number(spo2), p = Number(pulse);
          if (!personId) { setMsg("Choose a person first."); return; }
          if (!(s >= 50 && s <= 100 && p >= 25 && p <= 250)) { setMsg("Values out of range. Check the device and retype."); return; }
          addMeasurement({ personId, spo2: s, pulse: p, measuredAt: new Date().toISOString(), notes: "" }).then(() => setMsg("Saved.")).catch((e) => setMsg(e.message));
        }}>Save reading</button>
        {msg && <p>{msg}</p>}
      </div>
    </>
  );
}

function History({ people, names, medNames }: { people: Person[]; names: Map<string, Person>; medNames: Map<string, string> }) {
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState(datePlus(-13));
  const [to, setTo] = useState(toLocalDate(new Date()));
  const [doses, setDoses] = useState<Dose[]>([]);
  const [meas, setMeas] = useState<Measurement[]>([]);
  const [adh, setAdh] = useState<Adherence | null>(null);
  useEffect(() => {
    doseHistory(from, to, personId).then(setDoses);
    listMeasurements(personId).then((all) => setMeas(all.filter((m) => m.measuredAt.slice(0, 10) >= from && m.measuredAt.slice(0, 10) <= to)));
    adherence(7).then(setAdh);
  }, [personId, from, to]);
  return (
    <>
      <h1>History</h1>
      {adh && <div className="card"><div className="dose-name">Last 7 days: {Math.round(adh.rate * 100)} percent taken ({adh.taken}/{adh.total})</div><p className="muted">{adh.pattern}</p></div>}
      <div className="card flat">
        <div className="measure-grid">
          <div><label htmlFor="h-person">Person</label>
            <select id="h-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label htmlFor="h-from">From</label><input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        </div>
        <label htmlFor="h-to">To</label><input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="section-head"><h2>Doses</h2></div>
      {doses.map((d) => (
        <div className="card flat" key={d.id}>
          <div className="dose"><div className="dose-time small">{d.localDate.slice(5)}<br />{d.localTime}</div>
            <div><div className="dose-name">{medNames.get(d.medId) ?? "Medication"}</div><span className={`chip ${d.status}`}>{d.status}</span> <PersonTag p={names.get(d.personId)} /></div></div>
        </div>
      ))}
      {!doses.length && <div className="empty"><h3>No dose records in range</h3></div>}
      <div className="section-head"><h2>Measurements</h2></div>
      {meas.map((m) => (
        <div className="card flat" key={m.id}>
          <div className="reading"><div><div className="val">{m.spo2}<span className="unit"> %</span></div></div>
            <div><div className="val">{m.pulse}<span className="unit"> bpm</span></div></div></div>
          <p className="small">{m.measuredAt.slice(0, 16).replace("T", " ")} <PersonTag p={names.get(m.personId)} /></p>
        </div>
      ))}
      {!meas.length && <div className="empty"><h3>No measurements in range</h3></div>}
    </>
  );
}

function People({ reload }: { reload: () => void }) {
  const [list, setList] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const load = async () => { const all = await listPeople(); setList(all); reload(); };
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>People</h1>
      <p className="muted">Everyone this app tracks. Deactivating hides them from pickers but keeps their records.</p>
      {list.map((p) => (
        <div className="card flat" key={p.id}>
          <div className="dose-name"><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: p.color, marginRight: 8 }} />{p.name} {!p.active && <span className="chip">inactive</span>}</div>
          <div className="dose-actions">
            <button className="ghost" onClick={() => savePerson({ ...p, active: !p.active }).then(load)}>{p.active ? "Deactivate" : "Reactivate"}</button>
          </div>
        </div>
      ))}
      {!list.length && <div className="empty"><h3>Nobody here yet</h3><p className="muted">Add the first person below.</p></div>}
      <div className="section-head"><h2>Add person</h2></div>
      <div className="card">
        <label htmlFor="person-name">Name</label>
        <input id="person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandma Lin" />
        <button className="big" onClick={() => { if (!name.trim()) return; addPerson(name).then(() => { setName(""); load(); }); }}>Add person</button>
      </div>
    </>
  );
}

function Settings() {
  const [msg, setMsg] = useState("");
  const onFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then((t) => importJSON(t).then(() => { setMsg("Backup restored. Reloading."); setTimeout(() => location.reload(), 800); }).catch((e) => setMsg(e.message)));
  };
  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Reminders, backups, and data.</p>
      <div className="section-head"><h2>Reminders</h2></div>
      <div className="card">
        <p className="muted">While the app is open, due doses badge the tab title every 30 seconds. There are no background notifications: this version has no server, so nothing can notify a closed app or a locked phone.</p>
        <p className="muted">For background reminders, use the Calendar file button on any medication. It downloads a schedule your phone calendar can notify from.</p>
      </div>
      <div className="section-head"><h2>Backup</h2></div>
      <div className="card">
        <button className="ghost" onClick={() => exportJSON().then((t) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([t], { type: "application/json" }));
          a.download = "kinwise-backup.json"; a.click();
        })}>Download backup (JSON)</button>
        <label htmlFor="restore">Restore from backup file</label>
        <input id="restore" type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
        {msg && <p>{msg}</p>}
      </div>
      <div className="section-head"><h2>Data</h2></div>
      <div className="card">
        <p className="muted">All records live in this browser only. Erasing removes everything with no recovery unless you downloaded a backup.</p>
        <button className="ghost danger" onClick={() => { if (confirm("Erase ALL local data? This cannot be undone.")) { indexedDB.deleteDatabase("kinwise"); location.reload(); } }}>Erase all local data</button>
      </div>
    </>
  );
}

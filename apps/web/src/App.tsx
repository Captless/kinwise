import { useEffect, useState } from "react";
import {
  addMeasurement, addMed, addPerson, adherence, confirmDose, datePlus, dosesOn, doseHistory,
  ensureDoses, exportJSON, importJSON, listMeasurements, listMeds, listPeople,
  reopenDose, savePerson, setMedStatus, toLocalDate,
  type Adherence, type Dose, type Med, type Measurement, type Person,
} from "./db";

type Tab = "today" | "meds" | "measure" | "history" | "people" | "settings";
const TABS: Tab[] = ["today", "meds", "measure", "history", "people", "settings"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [people, setPeople] = useState<Person[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [err, setErr] = useState("");

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
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t); }, []);
  useEffect(() => { refresh(); }, [tab]);

  const go = (t: Tab) => { setTab(t); setErr(""); };
  const names = new Map(people.map((p) => [p.id, p]));
  const medNames = new Map(meds.map((m) => [m.id, m.name]));
  const nav = (
    <nav className="mainnav" aria-label="Primary">{TABS.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>{t}{t === "today" && dueCount > 0 ? ` (${dueCount})` : ""}</button>)}</nav>
  );

  return (
    <div className="shell">
      <div className="stickyhead"><header className="topbar"><div className="brand">Kinwise</div></header>{nav}</div>
      <main className="content">
        {err && <p className="err">{err}</p>}
        {tab === "today" && <Today doses={doses} names={names} medNames={medNames} reload={refresh} />}
        {tab === "meds" && <Meds meds={meds} people={people} reload={refresh} />}
        {tab === "measure" && <Measure people={people} reload={refresh} />}
        {tab === "history" && <History people={people} names={names} medNames={medNames} />}
        {tab === "people" && <People reload={refresh} />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}

function PersonTag({ p }: { p?: Person }) {
  if (!p) return <span className="chip">unknown</span>;
  return <span className="chip"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: p.color, marginRight: 6 }} />{p.name}</span>;
}

function DoseRow({ d, person, med, reload }: { d: Dose; person?: Person; med: string; reload: () => void }) {
  const nowMs = Date.now();
  const diffMin = Math.round((nowMs - new Date(d.scheduledAt).getTime()) / 60000);
  const od = d.status === "due" && diffMin > 0;
  const cls = d.status === "taken" ? "ritem done" : od ? "ritem overdue" : "ritem";
  const sub =
    d.status === "taken" ? `Taken${d.confirmedAt ? ` ${d.confirmedAt.slice(11, 16)}` : ""}` :
    d.status === "skipped" ? "Skipped" :
    od ? `Overdue ${diffMin} min` : diffMin > -15 ? "Due now" : `Due in ${-diffMin} min`;
  const act = (fn: Promise<void>) => fn.then(reload);
  return (
    <div className={cls}>
      <div className="dline"><span className="rtime">{d.localTime}</span><span className="rname">{med}</span>{od && <span className="chip due">overdue</span>}</div>
      <div className="dsub">For {person?.name ?? "unknown"} · {sub}</div>
      {d.status === "due" && (
        <div className="dose-actions">
          <button className="act take" onClick={() => act(confirmDose(d.id, "taken"))}>Taken</button>
          <button className="act skip" onClick={() => act(confirmDose(d.id, "skipped"))}>Skip</button>
        </div>
      )}
      {d.status !== "due" && <div className="dose-actions"><button className="act undo" onClick={() => act(reopenDose(d.id))}>Undo</button></div>}
    </div>
  );
}

function Today({ doses, names, medNames, reload }: { doses: Dose[]; names: Map<string, Person>; medNames: Map<string, string>; reload: () => void }) {
  const now = new Date().toISOString();
  const overdue = doses.filter((d) => d.status === "due" && d.scheduledAt <= now);
  const rest = doses.filter((d) => !(d.status === "due" && d.scheduledAt <= now));
  if (!doses.length) return <><h1>Today</h1><div className="empty"><h3>Nothing scheduled</h3><p className="muted">Add a medication to begin.</p></div></>;
  return (
    <>
      <h1>Today</h1>
      <p className="muted">{overdue.length ? `${overdue.length} overdue. Start here.` : "All caught up for now."}</p>
      {overdue.length > 0 && <div className="overband">{overdue.length} dose{overdue.length > 1 ? "s" : ""} past time</div>}
      <div className="rail">
        {overdue.map((d) => <DoseRow key={d.id} d={d} person={names.get(d.personId)} med={medNames.get(d.medId) ?? "Medication"} reload={reload} />)}
        {rest.map((d) => <DoseRow key={d.id} d={d} person={names.get(d.personId)} med={medNames.get(d.medId) ?? "Medication"} reload={reload} />)}
      </div>
    </>
  );
}

function PersonPicker({ people, value, onChange, onAdd }: { people: Person[]; value: string; onChange: (id: string) => void; onAdd: () => void }) {
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
        <div className="timerow">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New person name" />
          <button className="big" style={{ width: "auto", margin: 0 }} onClick={async () => { if (!name.trim()) return; const p = await addPerson(name); onChange(p.id); onAdd(); setName(""); setAdding(false); }}>Add</button>
        </div>
      )}
    </div>
  );
}

function Meds({ meds, people, reload }: { meds: Med[]; people: Person[]; reload: () => void }) {
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [mode, setMode] = useState<"daily" | "weekdays">("daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [msg, setMsg] = useState("");
  const setTime = (i: number, v: string) => setTimes((t) => t.map((x, j) => (j === i ? v : x)));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openMed, setOpenMed] = useState<string | null>(null);
  const groups = [...people.map((p) => ({ id: p.id, name: p.name, color: p.color, items: meds.filter((m) => m.personId === p.id) }))];
  const unassigned = meds.filter((m) => !people.some((p) => p.id === m.personId));
  if (unassigned.length) groups.push({ id: "", name: "Unassigned", color: "#999", items: unassigned });
  const save = async () => {
    setMsg("");
    try {
      if (!personId) throw new Error("Choose a person first.");
      if (!name.trim()) throw new Error("Medication name is required.");
      const clean = [...new Set(times.map((t) => t.trim()).filter((t) => /^\d\d:\d\d$/.test(t)))].sort();
      if (!clean.length) throw new Error("Set at least one valid time.");
      if (mode === "weekdays" && !days.length) throw new Error("Pick at least one day.");
      const start = toLocalDate(new Date());
      await addMed({ personId, name: name.trim(), form: "tablet", strength: "", instructions: "", notes: "", status: "active", startDate: start, endDate: "", pillCount: null }, clean, days, mode);
      setName(""); setTimes(["08:00"]); setMode("daily");
      await ensureDoses(start, datePlus(14));
      reload();
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h1>Medications</h1>
      {groups.filter((g) => g.items.length).map((g) => {
        const open = openGroup === g.id;
        return (
          <div className="pgroup" key={g.id || "unassigned"}>
            <button className="pgroup-head" onClick={() => setOpenGroup(open ? null : g.id)} aria-expanded={open}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: g.color }} />
              <span className="pgroup-name">{g.name}</span>
              <span className="small">{g.items.length}</span>
              <span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open && g.items.map((m) => (
              <div className="medcard" key={m.id}>
                <button className="medinfo" onClick={() => setOpenMed(openMed === m.id ? null : m.id)} aria-expanded={openMed === m.id}>
                  <span className="rname">{m.name}</span>
                  <span className={`chip ${m.status === "active" ? "taken" : "skipped"}`}>{m.status}</span>
                </button>
                {openMed === m.id && (
                  <div className="medactions2">
                    {m.status === "active" && <button className="ghost sm" onClick={() => setMedStatus(m.id, "paused").then(() => ensureDoses(toLocalDate(new Date()), datePlus(14)).then(reload))}>Pause</button>}
                    {m.status === "paused" && <button className="ghost sm" onClick={() => setMedStatus(m.id, "active").then(() => ensureDoses(toLocalDate(new Date()), datePlus(14)).then(reload))}>Resume</button>}
                    {m.status !== "discontinued" ? <button className="ghost sm danger" onClick={() => { if (confirm("Discontinue? Past records are kept.")) setMedStatus(m.id, "discontinued").then(reload); }}>End</button> : <span className="small">ended</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {!meds.length && <div className="empty"><h3>No medications yet</h3></div>}
      <div className="sect">Add medication</div>
      <PersonPicker people={people} value={personId} onChange={setPersonId} onAdd={reload} />
      <label htmlFor="med-name">Medication name</label>
      <input id="med-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As written on the package" />
      <label>Schedule</label>
      <div className="timerow">
        <button className={mode === "daily" ? "big" : "ghost"} style={{ margin: 0 }} onClick={() => setMode("daily")}>Daily</button>
        <button className={mode === "weekdays" ? "big" : "ghost"} style={{ margin: 0 }} onClick={() => setMode("weekdays")}>Picked days</button>
      </div>
      {mode === "weekdays" && (
        <div className="daypick">{DAYS.map((d, i) => <button key={i} className={days.includes(i) ? "on" : ""} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} aria-pressed={days.includes(i)}>{d}</button>)}</div>
      )}
      {times.map((t, i) => (
        <div className="timerow" key={i}>
          <input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} aria-label={`Dose time ${i + 1}`} />
          {times.length > 1 && <button className="ghost sm" onClick={() => setTimes((x) => x.filter((_, j) => j !== i))} aria-label="Remove time">Remove</button>}
        </div>
      ))}
      <button className="ghost" style={{ width: "100%" }} onClick={() => setTimes((t) => [...t, "12:00"])}>Add time</button>
      <button className="big" onClick={save}>Add medication</button>
      {msg && <p className="err">{msg}</p>}
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
      <PersonPicker people={people} value={personId} onChange={setPersonId} onAdd={reload} />
      <div className="cols2">
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
    </>
  );
}

function fmtConfirmed(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${date}, ${h}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`;
}

function History({ people, names, medNames }: { people: Person[]; names: Map<string, Person>; medNames: Map<string, string> }) {
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState(datePlus(-13));
  const [to, setTo] = useState(toLocalDate(new Date()));
  const [doses, setDoses] = useState<Dose[]>([]);
  const [meas, setMeas] = useState<Measurement[]>([]);
  const [adh, setAdh] = useState<Adherence | null>(null);
  const [hTab, setHTab] = useState<"doses" | "meas">("doses");
  useEffect(() => {
    doseHistory(from, to, personId).then(setDoses);
    listMeasurements(personId).then((all) => setMeas(all.filter((m) => m.measuredAt.slice(0, 10) >= from && m.measuredAt.slice(0, 10) <= to)));
    adherence(7).then(setAdh);
  }, [personId, from, to]);
  return (
    <>
      <h1>History</h1>
      <div className="stickybar">
        {adh && <p className="muted" style={{ margin: "0 0 8px" }}>Last 7 days: {Math.round(adh.rate * 100)} percent taken ({adh.taken}/{adh.total}). {adh.pattern}</p>}
        <div className="cols2">
          <div><label htmlFor="h-person">Person</label>
            <select id="h-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label htmlFor="h-from">From</label><input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        </div>
        <label htmlFor="h-to">To</label><input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="htabs" role="tablist" aria-label="History sections">
          <button role="tab" aria-selected={hTab === "doses"} className={hTab === "doses" ? "on" : ""} onClick={() => setHTab("doses")}>Doses ({doses.length})</button>
          <button role="tab" aria-selected={hTab === "meas"} className={hTab === "meas" ? "on" : ""} onClick={() => setHTab("meas")}>Measurements ({meas.length})</button>
        </div>
      </div>
      {hTab === "doses" && (
      <div className="hscroll">
      {doses.map((d) => (
        <div className="hcard" key={d.id}>
          <div className="hwhen"><span className="hdate">{d.localDate.slice(5).replace("-", "/")}</span><span className="htime">{d.localTime}</span></div>
          <div className="hwhat"><span className="rname">{medNames.get(d.medId) ?? "Medication"}</span><span className="dsub">For {names.get(d.personId)?.name ?? "unknown"}</span>{d.status === "taken" && d.confirmedAt ? <span className="dsub">Taken {fmtConfirmed(d.confirmedAt)}</span> : d.status === "skipped" ? <span className="dsub">Skipped</span> : null}</div>
          <div className={`hstatus ${d.status}`}>{d.status}</div>
        </div>
      ))}
      {!doses.length && <div className="empty"><h3>No dose records in range</h3></div>}
      </div>
      )}
      {hTab === "meas" && (
      <div className="hscroll">
      {meas.map((m) => (
        <div className="hcard" key={m.id}>
          <div className="reading"><div><span className="val">{m.spo2}</span><span className="unit"> %</span></div><div><span className="val">{m.pulse}</span><span className="unit"> bpm</span></div></div>
          <div style={{ textAlign: "right" }}><PersonTag p={names.get(m.personId)} /><div className="small">{m.measuredAt.slice(0, 16).replace("T", " ")}</div></div>
        </div>
      ))}
      {!meas.length && <div className="empty"><h3>No measurements in range</h3></div>}
      </div>
      )}
    </>
  );
}

function People({ reload }: { reload: () => void }) {
  const [list, setList] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const load = async () => { setList(await listPeople()); reload(); };
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>People</h1>
      <p className="muted">Deactivating hides them from pickers but keeps records.</p>
      {list.map((p) => (
        <div className="row" key={p.id}>
          <div><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: p.color, marginRight: 8 }} /><strong>{p.name}</strong> {!p.active && <span className="chip">inactive</span>}</div>
          <button className="ghost sm" onClick={() => savePerson({ ...p, active: !p.active }).then(load)}>{p.active ? "Deactivate" : "Reactivate"}</button>
        </div>
      ))}
      {!list.length && <div className="empty"><h3>Nobody here yet</h3></div>}
      <div className="sect">Add person</div>
      <label htmlFor="person-name">Name</label>
      <input id="person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grandma Lin" />
      <button className="big" onClick={() => { if (!name.trim()) return; addPerson(name).then(() => { setName(""); load(); }); }}>Add person</button>
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
      <div className="sect">Reminders</div>
      <p><span className="devbadge">In development</span></p>
      <p className="muted">Background reminders ship before deployment.</p>
      <div className="sect">Backup</div>
      <button className="ghost" style={{ width: "100%", marginBottom: 8 }} onClick={() => exportJSON().then((t) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([t], { type: "application/json" }));
        a.download = "kinwise-backup.json"; a.click();
      })}>Download backup (JSON)</button>
      <label htmlFor="restore">Restore from backup file</label>
      <input id="restore" type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
      {msg && <p>{msg}</p>}
      <div className="sect">Data</div>
      <p className="muted">Records live in this browser only.</p>
      <button className="ghost danger" style={{ width: "100%" }} onClick={() => { if (confirm("Erase ALL local data? This cannot be undone.")) { indexedDB.deleteDatabase("kinwise"); location.reload(); } }}>Erase all local data</button>
    </>
  );
}

import { useEffect, useState } from "react";
import { api } from "./api";

type Tab = "today" | "meds" | "measure" | "history" | "settings";
interface Profile { id: string; display_name: string }
const TABS: Tab[] = ["today", "meds", "measure", "history", "settings"];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pid, setPid] = useState(localStorage.getItem("kw_pid") ?? "");
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const loadProfiles = () => api.call("/api/profiles").then((d) => {
    setProfiles(d.profiles);
    setAuthed(true);
    if (!pid && d.profiles[0]) { setPid(d.profiles[0].id); localStorage.setItem("kw_pid", d.profiles[0].id); }
  }).catch(() => setAuthed(false));
  useEffect(() => { loadProfiles(); }, []);
  useEffect(() => {
    if (!authed || !pid) return;
    const day = new Date().toISOString().slice(0, 10);
    setLoading(true); setData(null);
    const path = tab === "history" ? `/api/history?profile_id=${pid}&from=2020-01-01&to=2999-01-01`
      : tab === "meds" ? `/api/medications?profile_id=${pid}`
      : tab === "today" ? `/api/today?profile_id=${pid}&date=${day}` : null;
    if (!path) { setLoading(false); return; }
    api.call(path).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [tab, pid, authed]);

  const go = (t: Tab) => { setTab(t); setErr(""); };
  const profileName = profiles.find((p) => p.id === pid)?.display_name ?? "";

  if (authed === null) return <div className="unlock-wrap"><div className="unlock-card"><div className="skel" /></div></div>;
  if (!authed) return (
    <div className="unlock-wrap">
      <div className="unlock-card">
        <h1>Kinwise</h1>
        <p className="sub">Family medication and health records. Enter the family access code to unlock this device.</p>
        <label htmlFor="code">Family access code</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="e.g. XXXX-XXXX-XXXX" />
        <button className="big" onClick={() => api.call("/api/auth/verify", { method: "POST", body: JSON.stringify({ code }) }).then(loadProfiles).catch((e) => setErr(e.message))}>Unlock</button>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Kinwise</div>
        <select value={pid} onChange={(e) => { setPid(e.target.value); localStorage.setItem("kw_pid", e.target.value); }} aria-label="Grandparent profile">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </header>
      <aside className="sidebar">
        <div className="brand">Kinwise</div>
        <div className="tag">Family medication and health</div>
        <select value={pid} onChange={(e) => { setPid(e.target.value); localStorage.setItem("kw_pid", e.target.value); }} aria-label="Grandparent profile">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <nav>{TABS.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>{t}</button>)}</nav>
        <div className="lock"><button className="ghost" style={{ borderColor: "rgb(255 255 255 / 0.4)", color: "#fff" }} onClick={() => api.call("/api/auth/logout", { method: "POST" }).then(() => location.reload())}>Lock app</button></div>
      </aside>
      <main className="content">
        {err && <p className="err">{err}</p>}
        {tab === "today" && <Today data={data} loading={loading} name={profileName} />}
        {tab === "meds" && <Meds data={data} loading={loading} pid={pid} />}
        {tab === "measure" && <Measure pid={pid} name={profileName} />}
        {tab === "history" && <History data={data} loading={loading} />}
        {tab === "settings" && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Primary">{TABS.map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>{t}</button>)}</nav>
    </div>
  );
}

function Loading() { return <><div className="skel" /><div className="skel" /><div className="skel" /></>; }

function Today({ data, loading, name }: { data: any; loading: boolean; name: string }) {
  if (loading || !data) return <><h1>Today</h1><Loading /></>;
  const doses: any[] = data.doses ?? [];
  const due = doses.filter((d) => d.status === "due" || d.status === "upcoming").length;
  const confirm = (id: string, status: string) => api.call(`/api/doses/${id}/confirm`, { method: "POST", body: JSON.stringify({ status }) }).then(() => location.reload());
  const m = data.latest_measurement;
  return (
    <>
      <h1>Today</h1>
      <p className="muted">{name}{due > 0 ? ` has ${due} dose${due > 1 ? "s" : ""} waiting` : ", all doses recorded"}</p>
      <div className="today-grid">
        <section>
          <div className="section-head"><h2>Medication schedule</h2></div>
          {!doses.length && <div className="empty"><h3>No doses scheduled today</h3><p className="muted">New schedules appear here once added under Meds.</p></div>}
          {doses.map((d: any) => (
            <div className="card" key={d.id}>
              <div className="dose">
                <div className="dose-time">{d.scheduled_local_time}</div>
                <div>
                  <div className="dose-name">{d.name}</div>
                  <span className={`chip ${d.status}`}>{d.status}</span>
                  {d.status !== "taken" && (
                    <div className="dose-actions">
                      <button className="big" onClick={() => confirm(d.id, "taken")}>Mark taken</button>
                      <button className="ghost" onClick={() => confirm(d.id, "skipped")}>Skip</button>
                    </div>
                  )}
                  {d.status === "taken" && <div className="dose-actions"><button className="ghost" onClick={() => api.call(`/api/doses/${d.id}/correct`, { method: "POST", body: "{}" }).then(() => location.reload())}>Correct a mistake</button></div>}
                </div>
              </div>
            </div>
          ))}
        </section>
        <aside>
          <div className="section-head"><h2>Latest reading</h2></div>
          <div className="card">
            {m ? (
              <div className="reading">
                <div><div className="val">{m.spo2_percent}<span className="unit"> % SpO2</span></div></div>
                <div><div className="val">{m.pulse_bpm}<span className="unit"> bpm</span></div></div>
              </div>
            ) : <p className="muted">No readings yet.</p>}
            {m && <p className="small">Measured {m.measured_at_utc}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}

function Meds({ data, loading, pid }: { data: any; loading: boolean; pid: string }) {
  const [name, setName] = useState("");
  const [times, setTimes] = useState("08:00");
  const [msg, setMsg] = useState("");
  if (loading || !data) return <><h1>Medications</h1><Loading /></>;
  const save = async () => {
    setMsg("");
    try {
      const med = await api.call("/api/medications", { method: "POST", body: JSON.stringify({ profile_id: pid, name, start_date: new Date().toISOString().slice(0, 10) }) });
      await api.call("/api/schedules", { method: "POST", body: JSON.stringify({ medication_id: med.id, recurrence_type: "daily", recurrence_config: { times: times.split(",").map((s) => s.trim()) }, start_date: new Date().toISOString().slice(0, 10) }) });
      location.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h1>Medications</h1>
      <p className="muted">Pausing or discontinuing keeps all past records. Nothing is deleted.</p>
      {(data.medications ?? []).map((m: any) => (
        <div className="card" key={m.id}>
          <div className="dose-name">{m.name} <span className={`chip ${m.status === "active" ? "taken" : "skipped"}`}>{m.status}</span></div>
          {m.strength ? <p className="muted">{m.strength}</p> : null}
          <div className="dose-actions">
            {m.status === "active" && <button className="ghost" onClick={() => api.call(`/api/medications/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) }).then(() => location.reload())}>Pause</button>}
            {m.status === "paused" && <button className="ghost" onClick={() => api.call(`/api/medications/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) }).then(() => location.reload())}>Resume</button>}
            {m.status !== "discontinued" && <button className="ghost danger" onClick={() => { if (confirm("Discontinue this medication? Past records are kept.")) api.call(`/api/medications/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "discontinued" }) }).then(() => location.reload()); }}>Discontinue</button>}
          </div>
        </div>
      ))}
      {!(data.medications ?? []).length && <div className="empty"><h3>No medications yet</h3><p className="muted">Add the first one below with its daily reminder times.</p></div>}
      <div className="section-head"><h2>Add medication</h2></div>
      <div className="card">
        <label htmlFor="med-name">Medication name</label>
        <input id="med-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As written on the package" />
        <label htmlFor="med-times">Reminder times (24h, comma separated)</label>
        <input id="med-times" value={times} onChange={(e) => setTimes(e.target.value)} placeholder="08:00, 20:00" />
        <button className="big" onClick={save}>Add with daily schedule</button>
        {msg && <p className="err">{msg}</p>}
      </div>
    </>
  );
}

function Measure({ pid, name }: { pid: string; name: string }) {
  const [spo2, setSpo2] = useState("98");
  const [pulse, setPulse] = useState("72");
  const [msg, setMsg] = useState("");
  return (
    <>
      <h1>Record measurement</h1>
      <p className="muted">Recording for {name || "selected profile"} from a pulse oximeter.</p>
      <div className="card">
        <div className="measure-grid">
          <div><label htmlFor="spo2">SpO2 percent</label><input id="spo2" value={spo2} inputMode="numeric" onChange={(e) => setSpo2(e.target.value)} /></div>
          <div><label htmlFor="pulse">Pulse (bpm)</label><input id="pulse" value={pulse} inputMode="numeric" onChange={(e) => setPulse(e.target.value)} /></div>
        </div>
        <button className="big" onClick={() => api.call("/api/measurements", { method: "POST", body: JSON.stringify({ profile_id: pid, spo2_percent: Number(spo2), pulse_bpm: Number(pulse), measured_at_utc: new Date().toISOString() }) }).then(() => setMsg("Saved. Visible under Today and History.")).catch((e) => setMsg(e.message))}>Save reading</button>
        {msg && <p>{msg}</p>}
      </div>
    </>
  );
}

function History({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <><h1>History</h1><Loading /></>;
  return (
    <>
      <h1>History</h1>
      <p className="muted">Recorded doses and measurements, newest first.</p>
      <div className="section-head"><h2>Doses</h2></div>
      {(data.doses ?? []).map((d: any) => (
        <div className="card flat" key={d.id}>
          <div className="dose"><div className="dose-time small">{d.scheduled_local_date}<br />{d.scheduled_local_time}</div>
          <div><div className="dose-name">{d.name}</div><span className={`chip ${d.status}`}>{d.status}</span></div></div>
        </div>
      ))}
      {!(data.doses ?? []).length && <div className="empty"><h3>No dose records</h3></div>}
      <div className="section-head"><h2>Measurements</h2></div>
      {(data.measurements ?? []).map((m: any) => (
        <div className="card flat" key={m.id}>
          <div className="reading"><div><div className="val">{m.spo2_percent}<span className="unit"> %</span></div></div>
          <div><div className="val">{m.pulse_bpm}<span className="unit"> bpm</span></div></div></div>
          <p className="small">{m.measured_at_utc}</p>
        </div>
      ))}
      {!(data.measurements ?? []).length && <div className="empty"><h3>No measurements yet</h3></div>}
    </>
  );
}

function Settings() {
  const [msg, setMsg] = useState("");
  const setup = async () => {
    setMsg("");
    try {
      if (!("Notification" in window)) { setMsg("This browser does not support notifications."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg("Permission denied. On iPhone, install via Add to Home Screen first, then allow notifications in Settings."); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!key) { setMsg("App missing push config. Rebuild required."); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)) });
      const p = sub.toJSON();
      await api.call("/api/push/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: p.endpoint, subscription_keys: p.keys, device_label: navigator.userAgent.slice(0, 80) }) });
      setMsg("This device is subscribed. Send a test below to confirm.");
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Notifications, data safety, and access.</p>
      <div className="section-head"><h2>Reminders on this device</h2></div>
      <div className="card">
        <p className="muted">On iPhone, add the app to the Home Screen first, then enable notifications here.</p>
        <button className="big" onClick={setup}>Enable notifications</button>
        <button className="ghost" onClick={() => api.call("/api/push/test", { method: "POST", body: "{}" }).then((d) => setMsg(`Test sent to ${d.results.length} device(s). A reminder should appear shortly.`)).catch((e) => setMsg(e.message))}>Send test notification</button>
        {msg && <p>{msg}</p>}
      </div>
      <div className="section-head"><h2>Access</h2></div>
      <div className="card">
        <p className="muted">Locking ends the session on this device only. Other devices stay signed in.</p>
        <button className="ghost" onClick={() => api.call("/api/auth/logout", { method: "POST" }).then(() => location.reload())}>Lock this device</button>
      </div>
    </>
  );
}

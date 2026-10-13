import { useEffect, useState } from "react";
import { api } from "./api";

type Tab = "today" | "meds" | "measure" | "history" | "settings";
interface Profile { id: string; display_name: string }

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pid, setPid] = useState(localStorage.getItem("kw_pid") ?? "");
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<any>(null);
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
    if (tab === "today") api.call(`/api/today?profile_id=${pid}&date=${day}`).then(setData).catch((e) => setErr(e.message));
    if (tab === "history") api.call(`/api/history?profile_id=${pid}&from=2020-01-01&to=2999-01-01`).then(setData).catch((e) => setErr(e.message));
    if (tab === "meds") api.call(`/api/medications?profile_id=${pid}`).then(setData).catch((e) => setErr(e.message));
  }, [tab, pid, authed]);

  if (authed === null) return <main><p>Loading…</p></main>;
  if (!authed) return (
    <main>
      <h1>Kinwise</h1>
      <p>Enter family access code.</p>
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Family code" />
      <button className="big" onClick={() => api.call("/api/auth/verify", { method: "POST", body: JSON.stringify({ code }) }).then(loadProfiles).catch((e) => setErr(e.message))}>Unlock</button>
      {err && <p className="err">{err}</p>}
    </main>
  );

  return (<>
    <header>
      <select value={pid} onChange={(e) => { setPid(e.target.value); localStorage.setItem("kw_pid", e.target.value); }} aria-label="Grandparent profile">
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
      </select>
    </header>
    <main>
      {err && <p className="err">{err}</p>}
      {tab === "today" && <Today data={data} reload={() => setTab("today")} pid={pid} />}
      {tab === "meds" && <Meds data={data} pid={pid} />}
      {tab === "measure" && <Measure pid={pid} />}
      {tab === "history" && <History data={data} />}
      {tab === "settings" && <Settings />}
    </main>
    <nav>{(["today", "meds", "measure", "history", "settings"] as Tab[]).map((t) => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); setErr(""); setData(null); }}>{t}</button>)}</nav>
  </>);
}

function Today({ data, pid }: { data: any; reload: () => void; pid: string }) {
  if (!data) return <p>Loading…</p>;
  const confirm = (id: string, status: string) => api.call(`/api/doses/${id}/confirm`, { method: "POST", body: JSON.stringify({ status }) }).then(() => location.reload());
  return (<>
    <h2>Today</h2>
    {(data.doses ?? []).map((d: any) => (
      <div className="card" key={d.id}>
        <div><strong>{d.scheduled_local_time}</strong> — {d.name}</div>
        <div className="muted">Status: {d.status}</div>
        {d.status !== "taken" && <><button className="big" onClick={() => confirm(d.id, "taken")}>Mark taken</button><button className="ghost" onClick={() => confirm(d.id, "skipped")}>Skip</button></>}
        {d.status === "taken" && <button className="ghost" onClick={() => api.call(`/api/doses/${d.id}/correct`, { method: "POST", body: "{}" }).then(() => location.reload())}>Correct mistake</button>}
      </div>
    ))}
    {!(data.doses ?? []).length && <p className="muted">No doses scheduled today.</p>}
    <div className="card"><div>Latest reading</div>{data.latest_measurement ? <div>{data.latest_measurement.spo2_percent}% · {data.latest_measurement.pulse_bpm} bpm · {data.latest_measurement.measured_at_utc}</div> : <div className="muted">None yet</div>}</div>
    <div style={{ display: "none" }}>{pid}</div>
  </>);
}

function Meds({ data, pid }: { data: any; pid: string }) {
  const [name, setName] = useState("");
  const [times, setTimes] = useState("08:00");
  const save = async () => {
    const med = await api.call("/api/medications", { method: "POST", body: JSON.stringify({ profile_id: pid, name, start_date: new Date().toISOString().slice(0, 10) }) });
    await api.call("/api/schedules", { method: "POST", body: JSON.stringify({ medication_id: med.id, recurrence_type: "daily", recurrence_config: { times: times.split(",").map((s) => s.trim()) }, start_date: new Date().toISOString().slice(0, 10) }) });
    location.reload();
  };
  return (<>
    <h2>Medications</h2>
    {(data?.medications ?? []).map((m: any) => (
      <div className="card" key={m.id}><div><strong>{m.name}</strong> <span className="muted">({m.status})</span></div>
        <div>
          {m.status === "active" && <><button className="ghost" onClick={() => api.call(`/api/medications/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) }).then(() => location.reload())}>Pause</button></>}
          <button className="ghost" onClick={() => { if (confirm("Discontinue? History kept.")) api.call(`/api/medications/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: "discontinued" }) }).then(() => location.reload()); }}>Discontinue</button>
        </div></div>
    ))}
    <div className="card"><label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Times (HH:MM, comma separated)<input value={times} onChange={(e) => setTimes(e.target.value)} /></label><button className="big" onClick={save}>Add medication + daily schedule</button></div>
  </>);
}

function Measure({ pid }: { pid: string }) {
  const [spo2, setSpo2] = useState("98");
  const [pulse, setPulse] = useState("72");
  const [msg, setMsg] = useState("");
  return (
    <div className="card"><h2>Record measurement</h2>
      <label>SpO2 %<input value={spo2} inputMode="numeric" onChange={(e) => setSpo2(e.target.value)} /></label>
      <label>Pulse bpm<input value={pulse} inputMode="numeric" onChange={(e) => setPulse(e.target.value)} /></label>
      <button className="big" onClick={() => api.call("/api/measurements", { method: "POST", body: JSON.stringify({ profile_id: pid, spo2_percent: Number(spo2), pulse_bpm: Number(pulse), measured_at_utc: new Date().toISOString() }) }).then(() => setMsg("Saved")).catch((e) => setMsg(e.message))}>Save reading</button>
      {msg && <p>{msg}</p>}
    </div>
  );
}

function History({ data }: { data: any }) {
  if (!data) return <p>Loading…</p>;
  return (<>
    <h2>History</h2>
    <h3>Doses</h3>
    {(data.doses ?? []).map((d: any) => <div className="card" key={d.id}>{d.scheduled_local_date} {d.scheduled_local_time} — {d.name} — {d.status}</div>)}
    <h3>Measurements</h3>
    {(data.measurements ?? []).map((m: any) => <div className="card" key={m.id}>{m.measured_at_utc}: {m.spo2_percent}% · {m.pulse_bpm} bpm</div>)}
  </>);
}

function Settings() {
  const [msg, setMsg] = useState("");
  const setup = async () => {
    try {
      if (!("Notification" in window)) { setMsg("Notifications unsupported here"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg("Permission denied. Enable in iPhone Settings after Home Screen install."); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!key) { setMsg("App missing push config. Rebuild required."); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)) });
      const p = sub.toJSON();
      await api.call("/api/push/subscriptions", { method: "POST", body: JSON.stringify({ endpoint: p.endpoint, subscription_keys: p.keys, device_label: navigator.userAgent.slice(0, 80) }) });
      setMsg("Subscribed. Send test below.");
    } catch (e: any) { setMsg(e.message); }
  };
  return (<div className="card"><h2>Settings</h2>
    <p className="muted">iPhone: Add to Home Screen first, then enable notifications.</p>
    <button className="big" onClick={setup}>Enable notifications</button>
    <button className="ghost" onClick={() => api.call("/api/push/test", { method: "POST", body: "{}" }).then((d) => setMsg(JSON.stringify(d.results))).catch((e) => setMsg(e.message))}>Send test notification</button>
    <button className="ghost" onClick={() => api.call("/api/auth/logout", { method: "POST" }).then(() => location.reload())}>Lock app</button>
    {msg && <p>{msg}</p>}
  </div>);
}

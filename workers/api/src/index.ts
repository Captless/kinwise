import { issueSession, verifySession, sha256hex, sessionCookie, clearCookie } from "./auth";
import { expandOccurrences } from "./schedule";

interface Env {
  DB: D1Database;
  FAMILY_CODE_HASH: string;
  SESSION_SECRET: string;
  CODE_VERSION?: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_JWK: string;
  VAPID_SUBJECT: string;
  API_ORIGIN: string;
}
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const json = (d: unknown, s = 200, h: HeadersInit = {}) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", ...h } });
const attempts = new Map<string, { n: number; t: number }>();

function cors(env: Env, req: Request): Record<string, string> {
  const allowed = (env.API_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const match = allowed.includes(origin) ? origin : (allowed[0] ?? "");
  return { "access-control-allow-origin": match, "access-control-allow-credentials": "true", vary: "Origin" };
}
async function authed(req: Request, env: Env): Promise<boolean> {
  return verifySession(req, env.SESSION_SECRET, Number(env.CODE_VERSION ?? "1"));
}
function checkRate(ip: string): boolean {
  const r = attempts.get(ip) ?? { n: 0, t: Date.now() };
  if (Date.now() - r.t > 60e3) attempts.set(ip, { n: 1, t: Date.now() });
  else {
    r.n++;
    attempts.set(ip, r);
  }
  return (attempts.get(ip)?.n ?? 0) <= 6;
}

// Minimal VAPID JWT (ES256) for payload-less push
function b64(b: Uint8Array): string {
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function vapidAuth(env: Env, aud: string): Promise<string> {
  const h = b64(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64(new TextEncoder().encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 43200, sub: env.VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64(new Uint8Array(sig))}`;
}
async function sendPush(env: Env, endpoint: string): Promise<number> {
  const aud = new URL(endpoint).origin;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "high", Authorization: `vapid t=${await vapidAuth(env, aud)}, k=${env.VAPID_PUBLIC_KEY}` },
  });
  return res.status;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    const C = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { headers: { ...C, "access-control-allow-methods": "GET,POST,PATCH,DELETE", "access-control-allow-headers": "content-type" } });
    const ip = req.headers.get("cf-connecting-ip") ?? "local";

    if (p === "/api/auth/verify" && req.method === "POST") {
      if (!checkRate(ip)) return json({ error: "too many attempts" }, 429, C);
      const { code } = (await req.json().catch(() => ({}))) as { code?: string };
      if (!code || (await sha256hex(code)) !== env.FAMILY_CODE_HASH) return json({ error: "invalid code" }, 401, C);
      const s = await issueSession(env.SESSION_SECRET, Number(env.CODE_VERSION ?? "1"));
      return json({ ok: true }, 200, { ...C, "set-cookie": sessionCookie(s) });
    }
    if (p === "/api/auth/logout" && req.method === "POST") return json({ ok: true }, 200, { ...C, "set-cookie": clearCookie() });
    if (!p.startsWith("/api/health") && !(await authed(req, env))) return json({ error: "unauthorized" }, 401, C);
    if (p === "/api/health") return json({ ok: true }, 200, C);

    const q = (sql: string, args: unknown[] = []) => env.DB.prepare(sql).bind(...args);

    // Profiles
    if (p === "/api/profiles" && req.method === "GET") return json({ profiles: (await q("SELECT * FROM profiles WHERE is_active=1").all()).results }, 200, C);
    if (p === "/api/profiles" && req.method === "POST") {
      const b = (await req.json()) as { display_name: string; avatar_key?: string };
      if (!b.display_name?.trim()) return json({ error: "name required" }, 400, C);
      const id = uid();
      await q("INSERT INTO profiles (id, display_name, avatar_key) VALUES (?,?,?)", [id, b.display_name.trim().slice(0, 60), b.avatar_key ?? ""]).run();
      return json({ id }, 201, C);
    }
    // Medications
    if (p === "/api/medications" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id")!;
      return json({ medications: (await q("SELECT * FROM medications WHERE profile_id=? ORDER BY name", [pid]).all()).results }, 200, C);
    }
    if (p === "/api/medications" && req.method === "POST") {
      const b = (await req.json()) as Record<string, string>;
      if (!b.profile_id || !b.name?.trim() || !b.start_date) return json({ error: "profile_id, name, start_date required" }, 400, C);
      const id = uid();
      await q("INSERT INTO medications (id, profile_id, name, form, strength, prescribed_instructions, prescribed_amount, notes, start_date, end_date) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, b.profile_id, b.name.trim(), b.form ?? "tablet", b.strength ?? "", b.prescribed_instructions ?? "", b.prescribed_amount ?? "", b.notes ?? "", b.start_date, b.end_date ?? null]).run();
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), "medication.create", "medication", id, JSON.stringify(b)]).run();
      return json({ id }, 201, C);
    }
    const medPatch = p.match(/^\/api\/medications\/([\w-]+)$/);
    if (medPatch && req.method === "PATCH") {
      const b = (await req.json()) as Record<string, string>;
      if (b.status) await q("UPDATE medications SET status=?, updated_at=? WHERE id=?", [b.status, now(), medPatch[1]]).run();
      else await q("UPDATE medications SET name=COALESCE(?,name), notes=COALESCE(?,notes), end_date=COALESCE(?,end_date), updated_at=? WHERE id=?", [b.name, b.notes, b.end_date, now(), medPatch[1]]).run();
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), "medication.update", "medication", medPatch[1], JSON.stringify(b)]).run();
      // Deactivate future occurrences on pause/discontinue/end change
      if (b.status === "paused" || b.status === "discontinued")
        await q("UPDATE medication_schedules SET is_active=0 WHERE medication_id=?", [medPatch[1]]).run();
      return json({ ok: true }, 200, C);
    }
    // Schedules
    if (p === "/api/schedules" && req.method === "POST") {
      const b = (await req.json()) as { medication_id: string; recurrence_type: string; recurrence_config: { times: string[]; weekdays?: number[] }; timezone?: string; start_date: string; end_date?: string };
      if (!b.medication_id || !["daily", "weekdays"].includes(b.recurrence_type) || !b.recurrence_config?.times?.length) return json({ error: "invalid schedule" }, 400, C);
      if (b.recurrence_type === "weekdays" && !(b.recurrence_config.weekdays?.length)) return json({ error: "weekdays required" }, 400, C);
      const id = uid();
      const tz = b.timezone ?? "Asia/Bangkok";
      await q("INSERT INTO medication_schedules (id, medication_id, recurrence_type, recurrence_config, timezone, start_date, end_date) VALUES (?,?,?,?,?,?,?)",
        [id, b.medication_id, b.recurrence_type, JSON.stringify(b.recurrence_config), tz, b.start_date, b.end_date ?? null]).run();
      return json({ id }, 201, C);
    }
    // Today
    if (p === "/api/today" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id")!;
      const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const doses = (await q("SELECT d.*, m.name FROM dose_occurrences d JOIN medications m ON m.id=d.medication_id WHERE m.profile_id=? AND d.scheduled_local_date=? ORDER BY d.scheduled_local_time", [pid, date]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? ORDER BY measured_at_utc DESC LIMIT 1", [pid]).all()).results;
      return json({ doses, latest_measurement: meas[0] ?? null }, 200, C);
    }
    // Dose confirm / correct
    const doseM = p.match(/^\/api\/doses\/([\w-]+)\/(confirm|correct)$/);
    if (doseM && req.method === "POST") {
      const b = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
      if (doseM[2] === "confirm") {
        if (!["taken", "skipped", "unconfirmed"].includes(b.status ?? "")) return json({ error: "invalid status" }, 400, C);
        await q("UPDATE dose_occurrences SET status=?, confirmed_at_utc=?, notes=?, updated_at=? WHERE id=?", [b.status, now(), b.note ?? "", now(), doseM[1]]).run();
      } else {
        await q("UPDATE dose_occurrences SET status='due', confirmed_at_utc=NULL, updated_at=? WHERE id=?", [now(), doseM[1]]).run();
      }
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), `dose.${doseM[2]}`, "dose", doseM[1], JSON.stringify(b)]).run();
      return json({ ok: true }, 200, C);
    }
    // Measurements
    if (p === "/api/measurements" && req.method === "POST") {
      const b = (await req.json()) as { profile_id: string; spo2_percent: number; pulse_bpm: number; measured_at_utc: string; notes?: string };
      if (!(b.spo2_percent >= 50 && b.spo2_percent <= 100 && b.pulse_bpm >= 25 && b.pulse_bpm <= 250)) return json({ error: "out of range" }, 400, C);
      const id = uid();
      await q("INSERT INTO measurements (id, profile_id, spo2_percent, pulse_bpm, measured_at_utc, notes) VALUES (?,?,?,?,?,?)",
        [id, b.profile_id, b.spo2_percent, b.pulse_bpm, b.measured_at_utc, b.notes ?? ""]).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/history" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id")!;
      const from = url.searchParams.get("from") ?? "1970-01-01";
      const to = url.searchParams.get("to") ?? "2999-01-01";
      const doses = (await q("SELECT d.*, m.name FROM dose_occurrences d JOIN medications m ON m.id=d.medication_id WHERE m.profile_id=? AND d.scheduled_local_date BETWEEN ? AND ? ORDER BY d.scheduled_at_utc DESC LIMIT 200", [pid, from, to]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? AND substr(measured_at_utc,1,10) BETWEEN ? AND ? ORDER BY measured_at_utc DESC LIMIT 200", [pid, from, to]).all()).results;
      return json({ doses, measurements: meas }, 200, C);
    }
    if (p === "/api/export" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id")!;
      const meds = (await q("SELECT * FROM medications WHERE profile_id=?", [pid]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? ORDER BY measured_at_utc", [pid]).all()).results;
      return json({ profile_id: pid, exported_at: now(), medications: meds, measurements: meas }, 200, C);
    }
    // Push subs
    if (p === "/api/push/subscriptions" && req.method === "POST") {
      const b = (await req.json()) as { device_label?: string; endpoint: string; subscription_keys: { p256dh: string; auth: string } };
      if (!b.endpoint?.startsWith("https://")) return json({ error: "invalid endpoint" }, 400, C);
      const id = uid();
      await q("INSERT OR REPLACE INTO push_subscriptions (id, device_label, endpoint, subscription_keys, is_active) VALUES (?,?,?,?,1)", [id, b.device_label ?? "", b.endpoint, JSON.stringify(b.subscription_keys)]).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/push/test" && req.method === "POST") {
      const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
      const subs = b.endpoint
        ? [{ endpoint: b.endpoint }]
        : (await q("SELECT endpoint FROM push_subscriptions WHERE is_active=1").all()).results as { endpoint: string }[];
      const results: { endpoint: string; status: number }[] = [];
      for (const s of subs) {
        try {
          results.push({ endpoint: s.endpoint, status: await sendPush(env, s.endpoint) });
        } catch {
          results.push({ endpoint: s.endpoint, status: 0 });
        }
      }
      return json({ results, note: "payload-less generic ping; open app to review schedule" }, 200, C);
    }
    return json({ error: "not found" }, 404, C);
  },

  async scheduled(_ev: ScheduledEvent, env: Env): Promise<void> {
    const nowMs = Date.now();
    const from = new Date(nowMs - 2 * 60e3);
    const to = new Date(nowMs + 1 * 60e3);
    const rows = (await env.DB.prepare(
      "SELECT m.id AS medication_id, s.id AS schedule_id, s.recurrence_type, s.recurrence_config, s.timezone FROM medication_schedules s JOIN medications m ON m.id=s.medication_id WHERE s.is_active=1 AND m.status='active' AND s.start_date <= date('now') AND (s.end_date IS NULL OR s.end_date >= date('now'))"
    ).all()).results as { medication_id: string; schedule_id: string; recurrence_type: string; recurrence_config: string; timezone: string }[];
    const scheds = rows.map((r) => {
      const cfg = JSON.parse(r.recurrence_config) as { times: string[]; weekdays?: number[] };
      return { medication_id: r.medication_id, schedule_id: r.schedule_id, recurrence_type: r.recurrence_type, times: cfg.times, weekdays: cfg.weekdays ?? [], timezone: r.timezone };
    });
    const occ = expandOccurrences(scheds, from, to);
    const subs = (await env.DB.prepare("SELECT id, endpoint FROM push_subscriptions WHERE is_active=1").all()).results as { id: string; endpoint: string }[];
    for (const o of occ) {
      const doseId = crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO dose_occurrences (id, medication_id, schedule_id, scheduled_at_utc, scheduled_local_date, scheduled_local_time, timezone, status) VALUES (?,?,?,?,?,?,?,'due')")
        .bind(doseId, o.medication_id, o.schedule_id, o.scheduled_at_utc, o.local_date, o.local_time, o.timezone).run();
      const doseRow = (await env.DB.prepare("SELECT id FROM dose_occurrences WHERE schedule_id=? AND scheduled_at_utc=?").bind(o.schedule_id, o.scheduled_at_utc).first()) as { id: string };
      for (const s of subs) {
        const delId = crypto.randomUUID();
        await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries (id, dose_occurrence_id, push_subscription_id) VALUES (?,?,?)").bind(delId, doseRow.id, s.id).run();
        try {
          const st = await sendPush(env, s.endpoint);
          await env.DB.prepare("UPDATE notification_deliveries SET status=?, attempt_count=attempt_count+1, last_attempt_at=?, provider_response_status=? WHERE dose_occurrence_id=? AND push_subscription_id=?")
            .bind(st >= 200 && st < 300 ? "sent" : "failed", now(), st, doseRow.id, s.id).run();
          await env.DB.prepare("UPDATE push_subscriptions SET last_successful_send_at=CASE WHEN ? BETWEEN 200 AND 299 THEN ? ELSE last_successful_send_at END, last_error_at=CASE WHEN ? BETWEEN 200 AND 299 THEN last_error_at ELSE ? END, is_active=CASE WHEN ? IN (404,410) THEN 0 ELSE is_active END")
            .bind(st, now(), st, now(), st).run();
        } catch {
          await env.DB.prepare("UPDATE notification_deliveries SET status='failed', attempt_count=attempt_count+1, last_attempt_at=? WHERE dose_occurrence_id=? AND push_subscription_id=?").bind(now(), doseRow.id, s.id).run();
        }
      }
    }
  },
};

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-MonWmy/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/auth.ts
var COOKIE = "kw_session";
var enc = new TextEncoder();
function b64url(b) {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const c of bytes)
    s += String.fromCharCode(c);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64url, "b64url");
function unb64url(s) {
  const b = Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  return b;
}
__name(unb64url, "unb64url");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
__name(hmac, "hmac");
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((c) => c.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
async function issueSession(secret, version, ttlH = 24 * 90) {
  const payload = b64url(enc.encode(JSON.stringify({ v: version, exp: Date.now() + ttlH * 36e5 })));
  return `${payload}.${await hmac(secret, payload)}`;
}
__name(issueSession, "issueSession");
async function verifySession(req, secret, version) {
  const m = req.headers.get("Cookie")?.match(/(?:^|;\s*)kw_session=([^;]+)/);
  if (!m)
    return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig)
    return false;
  if (sig !== await hmac(secret, payload))
    return false;
  try {
    const { v, exp } = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    return v === version && exp > Date.now();
  } catch {
    return false;
  }
}
__name(verifySession, "verifySession");
function sessionCookie(signed) {
  return `${COOKIE}=${signed}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${90 * 86400}`;
}
__name(sessionCookie, "sessionCookie");
function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}
__name(clearCookie, "clearCookie");

// src/schedule.ts
function expandOccurrences(schedules, fromUTC, toUTC) {
  const out = [];
  const days = [];
  const d = new Date(fromUTC);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(toUTC);
  end.setUTCDate(end.getUTCDate() + 1);
  for (let t = d.getTime(); t < end.getTime(); t += 864e5) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const fmt = /* @__PURE__ */ __name((tz, date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(date);
    const g = /* @__PURE__ */ __name((t) => parts.find((p) => p.type === t)?.value ?? "", "g");
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}`, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
  }, "fmt");
  for (const s of schedules) {
    for (const day of days) {
      for (const time of s.times) {
        const guess = /* @__PURE__ */ new Date(`${day}T${time}:00Z`);
        for (let off = -14 * 60; off <= 14 * 60; off += 15) {
          const cand = new Date(guess.getTime() + off * 6e4);
          const loc = fmt(s.timezone, cand);
          if (loc.date === day && loc.time === time) {
            if (cand >= fromUTC && cand < toUTC) {
              if (s.recurrence_type === "weekdays" && !s.weekdays.includes(loc.wd))
                break;
              out.push({ medication_id: s.medication_id, schedule_id: s.schedule_id, scheduled_at_utc: cand.toISOString(), local_date: day, local_time: time, timezone: s.timezone });
            }
            break;
          }
        }
      }
    }
  }
  return out;
}
__name(expandOccurrences, "expandOccurrences");

// src/index.ts
var uid = /* @__PURE__ */ __name(() => crypto.randomUUID(), "uid");
var now = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "now");
var json = /* @__PURE__ */ __name((d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", ...h } }), "json");
var attempts = /* @__PURE__ */ new Map();
function cors(env, req) {
  const allowed = (env.API_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const match = allowed.includes(origin) ? origin : allowed[0] ?? "";
  return { "access-control-allow-origin": match, "access-control-allow-credentials": "true", vary: "Origin" };
}
__name(cors, "cors");
async function authed(req, env) {
  return verifySession(req, env.SESSION_SECRET, Number(env.CODE_VERSION ?? "1"));
}
__name(authed, "authed");
function checkRate(ip) {
  const r = attempts.get(ip) ?? { n: 0, t: Date.now() };
  if (Date.now() - r.t > 6e4)
    attempts.set(ip, { n: 1, t: Date.now() });
  else {
    r.n++;
    attempts.set(ip, r);
  }
  return (attempts.get(ip)?.n ?? 0) <= 6;
}
__name(checkRate, "checkRate");
function b64(b) {
  let s = "";
  for (const c of b)
    s += String.fromCharCode(c);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64, "b64");
async function vapidAuth(env, aud) {
  const h = b64(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64(new TextEncoder().encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 43200, sub: env.VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64(new Uint8Array(sig))}`;
}
__name(vapidAuth, "vapidAuth");
async function sendPush(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "high", Authorization: `vapid t=${await vapidAuth(env, aud)}, k=${env.VAPID_PUBLIC_KEY}` }
  });
  return res.status;
}
__name(sendPush, "sendPush");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    const C = cors(env, req);
    if (req.method === "OPTIONS")
      return new Response(null, { headers: { ...C, "access-control-allow-methods": "GET,POST,PATCH,DELETE", "access-control-allow-headers": "content-type" } });
    const ip = req.headers.get("cf-connecting-ip") ?? "local";
    if (p === "/api/auth/verify" && req.method === "POST") {
      if (!checkRate(ip))
        return json({ error: "too many attempts" }, 429, C);
      const { code } = await req.json().catch(() => ({}));
      console.log("verify dbg", code?.length ?? -1, (env.FAMILY_CODE_HASH ?? "").length, (code ? await sha256hex(code) : "") === env.FAMILY_CODE_HASH);
      if (!code || await sha256hex(code) !== env.FAMILY_CODE_HASH)
        return json({ error: "invalid code" }, 401, C);
      const s = await issueSession(env.SESSION_SECRET, Number(env.CODE_VERSION ?? "1"));
      return json({ ok: true }, 200, { ...C, "set-cookie": sessionCookie(s) });
    }
    if (p === "/api/auth/logout" && req.method === "POST")
      return json({ ok: true }, 200, { ...C, "set-cookie": clearCookie() });
    if (!p.startsWith("/api/health") && !await authed(req, env))
      return json({ error: "unauthorized" }, 401, C);
    if (p === "/api/health")
      return json({ ok: true }, 200, C);
    const q = /* @__PURE__ */ __name((sql, args = []) => env.DB.prepare(sql).bind(...args), "q");
    if (p === "/api/profiles" && req.method === "GET")
      return json({ profiles: (await q("SELECT * FROM profiles WHERE is_active=1").all()).results }, 200, C);
    if (p === "/api/profiles" && req.method === "POST") {
      const b = await req.json();
      if (!b.display_name?.trim())
        return json({ error: "name required" }, 400, C);
      const id = uid();
      await q("INSERT INTO profiles (id, display_name, avatar_key) VALUES (?,?,?)", [id, b.display_name.trim().slice(0, 60), b.avatar_key ?? ""]).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/medications" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id");
      return json({ medications: (await q("SELECT * FROM medications WHERE profile_id=? ORDER BY name", [pid]).all()).results }, 200, C);
    }
    if (p === "/api/medications" && req.method === "POST") {
      const b = await req.json();
      if (!b.profile_id || !b.name?.trim() || !b.start_date)
        return json({ error: "profile_id, name, start_date required" }, 400, C);
      const id = uid();
      await q(
        "INSERT INTO medications (id, profile_id, name, form, strength, prescribed_instructions, prescribed_amount, notes, start_date, end_date) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, b.profile_id, b.name.trim(), b.form ?? "tablet", b.strength ?? "", b.prescribed_instructions ?? "", b.prescribed_amount ?? "", b.notes ?? "", b.start_date, b.end_date ?? null]
      ).run();
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), "medication.create", "medication", id, JSON.stringify(b)]).run();
      return json({ id }, 201, C);
    }
    const medPatch = p.match(/^\/api\/medications\/([\w-]+)$/);
    if (medPatch && req.method === "PATCH") {
      const b = await req.json();
      if (b.status)
        await q("UPDATE medications SET status=?, updated_at=? WHERE id=?", [b.status, now(), medPatch[1]]).run();
      else
        await q("UPDATE medications SET name=COALESCE(?,name), notes=COALESCE(?,notes), end_date=COALESCE(?,end_date), updated_at=? WHERE id=?", [b.name, b.notes, b.end_date, now(), medPatch[1]]).run();
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), "medication.update", "medication", medPatch[1], JSON.stringify(b)]).run();
      if (b.status === "paused" || b.status === "discontinued")
        await q("UPDATE medication_schedules SET is_active=0 WHERE medication_id=?", [medPatch[1]]).run();
      return json({ ok: true }, 200, C);
    }
    if (p === "/api/schedules" && req.method === "POST") {
      const b = await req.json();
      if (!b.medication_id || !["daily", "weekdays"].includes(b.recurrence_type) || !b.recurrence_config?.times?.length)
        return json({ error: "invalid schedule" }, 400, C);
      if (b.recurrence_type === "weekdays" && !b.recurrence_config.weekdays?.length)
        return json({ error: "weekdays required" }, 400, C);
      const id = uid();
      const tz = b.timezone ?? "Asia/Bangkok";
      await q(
        "INSERT INTO medication_schedules (id, medication_id, recurrence_type, recurrence_config, timezone, start_date, end_date) VALUES (?,?,?,?,?,?,?)",
        [id, b.medication_id, b.recurrence_type, JSON.stringify(b.recurrence_config), tz, b.start_date, b.end_date ?? null]
      ).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/today" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id");
      const date = url.searchParams.get("date") ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const doses = (await q("SELECT d.*, m.name FROM dose_occurrences d JOIN medications m ON m.id=d.medication_id WHERE m.profile_id=? AND d.scheduled_local_date=? ORDER BY d.scheduled_local_time", [pid, date]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? ORDER BY measured_at_utc DESC LIMIT 1", [pid]).all()).results;
      return json({ doses, latest_measurement: meas[0] ?? null }, 200, C);
    }
    const doseM = p.match(/^\/api\/doses\/([\w-]+)\/(confirm|correct)$/);
    if (doseM && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (doseM[2] === "confirm") {
        if (!["taken", "skipped", "unconfirmed"].includes(b.status ?? ""))
          return json({ error: "invalid status" }, 400, C);
        await q("UPDATE dose_occurrences SET status=?, confirmed_at_utc=?, notes=?, updated_at=? WHERE id=?", [b.status, now(), b.note ?? "", now(), doseM[1]]).run();
      } else {
        await q("UPDATE dose_occurrences SET status='due', confirmed_at_utc=NULL, updated_at=? WHERE id=?", [now(), doseM[1]]).run();
      }
      await q("INSERT INTO audit_log (id, action, entity_type, entity_id, diff) VALUES (?,?,?,?,?)", [uid(), `dose.${doseM[2]}`, "dose", doseM[1], JSON.stringify(b)]).run();
      return json({ ok: true }, 200, C);
    }
    if (p === "/api/measurements" && req.method === "POST") {
      const b = await req.json();
      if (!(b.spo2_percent >= 50 && b.spo2_percent <= 100 && b.pulse_bpm >= 25 && b.pulse_bpm <= 250))
        return json({ error: "out of range" }, 400, C);
      const id = uid();
      await q(
        "INSERT INTO measurements (id, profile_id, spo2_percent, pulse_bpm, measured_at_utc, notes) VALUES (?,?,?,?,?,?)",
        [id, b.profile_id, b.spo2_percent, b.pulse_bpm, b.measured_at_utc, b.notes ?? ""]
      ).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/history" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id");
      const from = url.searchParams.get("from") ?? "1970-01-01";
      const to = url.searchParams.get("to") ?? "2999-01-01";
      const doses = (await q("SELECT d.*, m.name FROM dose_occurrences d JOIN medications m ON m.id=d.medication_id WHERE m.profile_id=? AND d.scheduled_local_date BETWEEN ? AND ? ORDER BY d.scheduled_at_utc DESC LIMIT 200", [pid, from, to]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? AND substr(measured_at_utc,1,10) BETWEEN ? AND ? ORDER BY measured_at_utc DESC LIMIT 200", [pid, from, to]).all()).results;
      return json({ doses, measurements: meas }, 200, C);
    }
    if (p === "/api/export" && req.method === "GET") {
      const pid = url.searchParams.get("profile_id");
      const meds = (await q("SELECT * FROM medications WHERE profile_id=?", [pid]).all()).results;
      const meas = (await q("SELECT * FROM measurements WHERE profile_id=? ORDER BY measured_at_utc", [pid]).all()).results;
      return json({ profile_id: pid, exported_at: now(), medications: meds, measurements: meas }, 200, C);
    }
    if (p === "/api/push/subscriptions" && req.method === "POST") {
      const b = await req.json();
      if (!b.endpoint?.startsWith("https://"))
        return json({ error: "invalid endpoint" }, 400, C);
      const id = uid();
      await q("INSERT OR REPLACE INTO push_subscriptions (id, device_label, endpoint, subscription_keys, is_active) VALUES (?,?,?,?,1)", [id, b.device_label ?? "", b.endpoint, JSON.stringify(b.subscription_keys)]).run();
      return json({ id }, 201, C);
    }
    if (p === "/api/push/test" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const subs = b.endpoint ? [{ endpoint: b.endpoint }] : (await q("SELECT endpoint FROM push_subscriptions WHERE is_active=1").all()).results;
      const results = [];
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
  async scheduled(_ev, env) {
    const nowMs = Date.now();
    const from = new Date(nowMs - 2 * 6e4);
    const to = new Date(nowMs + 1 * 6e4);
    const rows = (await env.DB.prepare(
      "SELECT m.id AS medication_id, s.id AS schedule_id, s.recurrence_type, s.recurrence_config, s.timezone FROM medication_schedules s JOIN medications m ON m.id=s.medication_id WHERE s.is_active=1 AND m.status='active' AND s.start_date <= date('now') AND (s.end_date IS NULL OR s.end_date >= date('now'))"
    ).all()).results;
    const scheds = rows.map((r) => {
      const cfg = JSON.parse(r.recurrence_config);
      return { medication_id: r.medication_id, schedule_id: r.schedule_id, recurrence_type: r.recurrence_type, times: cfg.times, weekdays: cfg.weekdays ?? [], timezone: r.timezone };
    });
    const occ = expandOccurrences(scheds, from, to);
    const subs = (await env.DB.prepare("SELECT id, endpoint FROM push_subscriptions WHERE is_active=1").all()).results;
    for (const o of occ) {
      const doseId = crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO dose_occurrences (id, medication_id, schedule_id, scheduled_at_utc, scheduled_local_date, scheduled_local_time, timezone, status) VALUES (?,?,?,?,?,?,?,'due')").bind(doseId, o.medication_id, o.schedule_id, o.scheduled_at_utc, o.local_date, o.local_time, o.timezone).run();
      const doseRow = await env.DB.prepare("SELECT id FROM dose_occurrences WHERE schedule_id=? AND scheduled_at_utc=?").bind(o.schedule_id, o.scheduled_at_utc).first();
      for (const s of subs) {
        const delId = crypto.randomUUID();
        await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries (id, dose_occurrence_id, push_subscription_id) VALUES (?,?,?)").bind(delId, doseRow.id, s.id).run();
        try {
          const st = await sendPush(env, s.endpoint);
          await env.DB.prepare("UPDATE notification_deliveries SET status=?, attempt_count=attempt_count+1, last_attempt_at=?, provider_response_status=? WHERE dose_occurrence_id=? AND push_subscription_id=?").bind(st >= 200 && st < 300 ? "sent" : "failed", now(), st, doseRow.id, s.id).run();
          await env.DB.prepare("UPDATE push_subscriptions SET last_successful_send_at=CASE WHEN ? BETWEEN 200 AND 299 THEN ? ELSE last_successful_send_at END, last_error_at=CASE WHEN ? BETWEEN 200 AND 299 THEN last_error_at ELSE ? END, is_active=CASE WHEN ? IN (404,410) THEN 0 ELSE is_active END").bind(st, now(), st, now(), st).run();
        } catch {
          await env.DB.prepare("UPDATE notification_deliveries SET status='failed', attempt_count=attempt_count+1, last_attempt_at=? WHERE dose_occurrence_id=? AND push_subscription_id=?").bind(now(), doseRow.id, s.id).run();
        }
      }
    }
  }
};

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-MonWmy/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-MonWmy/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map

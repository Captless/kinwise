export const COOKIE = "kw_session";
const enc = new TextEncoder();

function b64url(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function unb64url(s: string): Uint8Array {
  const b = Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  return b;
}
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((c) => c.toString(16).padStart(2, "0")).join("");
}
export async function issueSession(secret: string, version: number, ttlH = 24 * 90): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ v: version, exp: Date.now() + ttlH * 3600e3 })));
  return `${payload}.${await hmac(secret, payload)}`;
}
export async function verifySession(req: Request, secret: string, version: number): Promise<boolean> {
  const m = req.headers.get("Cookie")?.match(/(?:^|;\s*)kw_session=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return false;
  if (sig !== (await hmac(secret, payload))) return false;
  try {
    const { v, exp } = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    return v === version && exp > Date.now();
  } catch {
    return false;
  }
}
// SameSite=None: API lives cross-origin (Pages -> workers.dev), cookie must attach on fetch.
export function sessionCookie(signed: string): string {
  return `${COOKIE}=${signed}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${90 * 86400}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

const BASE = import.meta.env.VITE_API_ORIGIN ?? "";

export const api = {
  async call(path: string, init?: RequestInit) {
    const r = await fetch(`${BASE}${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
    if (r.status === 401) throw new Error("Need family code");
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Request failed");
    return r.json();
  },
};

export function urlB64ToKey(s: string): Uint8Array {
  const b = Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
  return b;
}

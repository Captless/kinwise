import { describe, it, expect } from "vitest";
import { expandOccurrences } from "./schedule";
import { issueSession, verifySession } from "./auth";

describe("schedule", () => {
  it("expands daily times in window", () => {
    const occ = expandOccurrences(
      [{ medication_id: "m", schedule_id: "s", recurrence_type: "daily", times: ["08:00"], weekdays: [], timezone: "Asia/Bangkok" }],
      new Date("2026-10-13T00:00:00Z"), new Date("2026-10-13T02:00:00Z"));
    expect(occ).toHaveLength(1);
    expect(occ[0].local_time).toBe("08:00");
  });
  it("filters weekdays", () => {
    const occ = expandOccurrences(
      [{ medication_id: "m", schedule_id: "s", recurrence_type: "weekdays", times: ["08:00"], weekdays: [9 as never], timezone: "Asia/Bangkok" }],
      new Date("2026-10-13T00:00:00Z"), new Date("2026-10-13T02:00:00Z"));
    expect(occ).toHaveLength(0);
  });
});

describe("auth", () => {
  it("roundtrip session", async () => {
    const s = await issueSession("secret1234567890", 1, 1);
    const req = new Request("https://x/", { headers: { Cookie: `kw_session=${s}` } });
    expect(await verifySession(req, "secret1234567890", 1)).toBe(true);
    expect(await verifySession(req, "secret1234567890", 2)).toBe(false);
  });
});

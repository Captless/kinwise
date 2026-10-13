import { describe, it, expect } from "vitest";
import { expandLocal, type Schedule } from "./db";

const sch: Schedule = { id: "s1", medId: "m1", type: "daily", times: ["08:00", "20:00"], weekdays: [], startDate: "2026-10-01", endDate: "", active: true };

describe("expandLocal", () => {
  it("expands daily times per date", () => {
    const occ = expandLocal([sch], ["2026-10-13"]);
    expect(occ).toHaveLength(2);
    expect(occ[0]).toMatchObject({ localDate: "2026-10-13", localTime: "08:00" });
  });
  it("respects date bounds", () => {
    expect(expandLocal([sch], ["2026-09-30"])).toHaveLength(0);
  });
  it("filters weekdays", () => {
    const w: Schedule = { ...sch, type: "weekdays", weekdays: [1] };
    expect(expandLocal([w], ["2026-10-13"])).toHaveLength(0); // Tuesday
    expect(expandLocal([w], ["2026-10-12"])).toHaveLength(2); // Monday
  });
  it("skips inactive", () => {
    expect(expandLocal([{ ...sch, active: false }], ["2026-10-13"])).toHaveLength(0);
  });
});

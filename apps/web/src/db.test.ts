import { describe, it, expect } from "vitest";
import { expandLocal, medToICS, type Schedule, type Med } from "./db";

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

describe("medToICS", () => {
  const med = { id: "m1", personId: "p1", name: "TestMed", form: "tablet", strength: "", instructions: "", notes: "", status: "active", startDate: "2026-10-13", endDate: "", pillCount: null, createdAt: "", updatedAt: "" } as Med;
  it("emits daily recurrence", () => {
    const ics = medToICS(med, sch);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain("SUMMARY:Take TestMed");
  });
  it("emits weekly recurrence for weekdays", () => {
    const ics = medToICS(med, { ...sch, type: "weekdays", weekdays: [1, 3] });
    expect(ics).toContain("BYDAY=MO,WE");
  });
});

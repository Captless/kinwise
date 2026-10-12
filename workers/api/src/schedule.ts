export interface DueOcc {
  medication_id: string;
  schedule_id: string;
  scheduled_at_utc: string;
  local_date: string;
  local_time: string;
  timezone: string;
}

// Expand daily/weekdays times falling in [fromUTC, toUTC).
// Caller supplies schedule rows with parsed config. Pure, testable.
export function expandOccurrences(
  schedules: { medication_id: string; schedule_id: string; recurrence_type: string; times: string[]; weekdays: number[]; timezone: string }[],
  fromUTC: Date,
  toUTC: Date,
): DueOcc[] {
  const out: DueOcc[] = [];
  // Iterate per UTC minute bucket, map to each schedule local time via Intl.
  // Simple approach: for each schedule+time, check each day overlapped.
  const days: string[] = [];
  const d = new Date(fromUTC);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(toUTC);
  end.setUTCDate(end.getUTCDate() + 1);
  for (let t = d.getTime(); t < end.getTime(); t += 86400e3) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const fmt = (tz: string, date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(date);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}`, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
  };
  for (const s of schedules) {
    for (const day of days) {
      for (const time of s.times) {
        // Candidate local datetime -> find UTC instant by searching minutes.
        // Brute force: construct guess then refine via Intl offset (cheap, bounded window).
        const guess = new Date(`${day}T${time}:00Z`);
        for (let off = -14 * 60; off <= 14 * 60; off += 15) {
          const cand = new Date(guess.getTime() + off * 60e3);
          const loc = fmt(s.timezone, cand);
          if (loc.date === day && loc.time === time) {
            if (cand >= fromUTC && cand < toUTC) {
              if (s.recurrence_type === "weekdays" && !s.weekdays.includes(loc.wd)) break;
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

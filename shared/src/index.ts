import { z } from "zod";

export const profileSchema = z.object({
  display_name: z.string().min(1).max(60),
  avatar_key: z.string().max(40).optional().default(""),
  is_active: z.boolean().default(true),
});

export const medicationSchema = z.object({
  profile_id: z.string().min(1),
  name: z.string().min(1).max(120),
  form: z.enum(["tablet", "capsule", "liquid", "inhaler", "other"]),
  strength: z.string().max(60).default(""),
  prescribed_instructions: z.string().max(500).default(""),
  prescribed_amount: z.string().max(60).default(""),
  notes: z.string().max(1000).default(""),
  status: z.enum(["active", "paused", "discontinued"]).default("active"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const scheduleSchema = z.object({
  medication_id: z.string().min(1),
  recurrence_type: z.enum(["daily", "weekdays"]),
  recurrence_config: z.object({
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6),
    weekdays: z.array(z.number().int().min(0).max(6)).optional().default([]),
  }),
  timezone: z.string().min(1).default("Asia/Bangkok"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((s) => s.recurrence_type === "daily" || (s.recurrence_config.weekdays?.length ?? 0) > 0, {
  message: "weekdays required for weekdays recurrence",
});

export const doseConfirmSchema = z.object({
  status: z.enum(["taken", "skipped", "unconfirmed"]),
  note: z.string().max(500).default(""),
});

export const measurementSchema = z.object({
  profile_id: z.string().min(1),
  spo2_percent: z.number().int().min(50).max(100),
  pulse_bpm: z.number().int().min(25).max(250),
  measured_at_utc: z.string().datetime(),
  notes: z.string().max(500).default(""),
});

export const pushSubSchema = z.object({
  device_label: z.string().max(80).default(""),
  endpoint: z.string().url().max(2000),
  subscription_keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

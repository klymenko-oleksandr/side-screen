import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'];

/**
 * The single config file (PRD S1). Every section has defaults, so a minimal file works.
 * Secrets (API tokens) never go here; they live in `.env` or the Keychain (PRD N5).
 */
export const configSchema = z.object({
  server: z
    .object({
      host: z
        .string()
        .default('127.0.0.1')
        .refine((h) => LOOPBACK_HOSTS.includes(h), {
          message: `must be a loopback address (${LOOPBACK_HOSTS.join(', ')}); the server never listens on the network (PRD N5)`,
        }),
      port: z.number().int().min(1).max(65535).default(4300),
    })
    .prefault({}),

  locale: z
    .object({
      city: z.string().default('Kyiv'),
      timezone: z.string().default('Europe/Kyiv'),
    })
    .prefault({}),

  ui: z
    .object({
      /** Phase 1 keeps the footer hidden so the Reminders widgets fit below the window. */
      showFooter: z.boolean().default(false),
      logLines: z.number().int().min(1).max(30).default(6),
    })
    .prefault({}),

  /** Phase 1: every module is fed by mock sources. Real providers arrive from phase 2. */
  mock: z.boolean().default(true),

  power: z
    .object({
      address: z
        .object({
          street: z.string().default(''),
          house: z.string().default(''),
        })
        .prefault({}),
      /** A new verdict must hold this long before the status changes (PRD P1b). */
      holdSeconds: z.number().int().min(0).default(60),
      /** Reports older than this are ignored by the aggregator. */
      freshMinutes: z.number().int().min(1).default(10),
      /** |score| at or above this decides ON / OFF; below it is UNCONFIRMED. */
      threshold: z.number().min(0).default(2),
      weights: z
        .object({
          chargerAc: z.number().default(2),
          chargerBattery: z.number().default(1),
          dtekLiveOutage: z.number().default(3),
          dtekLiveClear: z.number().default(2),
          dtekSchedule: z.number().default(1),
          monitor: z.number().default(3),
        })
        .prefault({}),
    })
    .prefault({}),

  calendar: z
    .object({
      calendarId: z.string().default('primary'),
    })
    .prefault({}),

  dev: z
    .object({
      deploys: z
        .array(
          z.object({
            name: z.string(),
            provider: z.enum(['vercel', 'render', 'supabase']),
            projectId: z.string().optional(),
          }),
        )
        .default([]),
      /** GitHub repos as `owner/name`. */
      repos: z
        .array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'use owner/name'))
        .default([]),
    })
    .prefault({}),

  logs: z
    .object({
      /** `self` = the Side Screen server's own logs (PRD D4). */
      source: z.literal('self').default('self'),
    })
    .prefault({}),

  /** Refresh intervals (PRD N6). */
  polling: z
    .object({
      powerSeconds: z.number().positive().default(5),
      devSeconds: z.number().positive().default(60),
      calendarMinutes: z.number().positive().default(5),
      dtekLiveMinutes: z.number().positive().default(5),
      dtekScheduleHours: z.number().positive().default(6),
      weatherMinutes: z.number().positive().default(30),
    })
    .prefault({}),
});

export type SideScreenConfig = z.infer<typeof configSchema>;

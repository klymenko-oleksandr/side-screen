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

  /** true = every module uses its mock source (handy for UI work and demos). */
  mock: z.boolean().default(false),

  /** SQLite file for the power event log and schedule snapshots (PRD N4). */
  storage: z
    .object({
      path: z.string().default('data/side-screen.db'),
    })
    .prefault({}),

  power: z
    .object({
      /** Outage group (черга) as Yasno and DTEK show it, e.g. `38.1`. Drives the schedule. */
      group: z.string().default(''),
      /** Where the schedule comes from. The DTEK page sits behind bot protection; Yasno has a public JSON API. */
      scheduleSource: z.enum(['yasno', 'dtek']).default('yasno'),
      /** Also ask the DTEK page for the house's live status. Off by default: it answers 403 to servers. */
      dtekLive: z.boolean().default(false),
      yasno: z
        .object({
          /** Kyiv = region 25, DTEK Kyiv Grids = DSO 902. */
          regionId: z.number().int().default(25),
          dsoId: z.number().int().default(902),
        })
        .prefault({}),
      /** Street and house for the DTEK page (live status, or the DTEK schedule source). */
      address: z
        .object({
          street: z.string().default(''),
          house: z.string().default(''),
        })
        .prefault({}),
      dtekBaseUrl: z.url().default('https://www.dtek-kem.com.ua'),
      /** Public host pinged for the internet status (PRD P4). */
      pingHost: z.string().default('1.1.1.1'),
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

  /** The calendar's secret iCal URL is a secret: it lives in `.env` as GOOGLE_CALENDAR_ICS_URL. */
  calendar: z
    .object({
      /** Hide all-day events from the Today list. */
      hideAllDay: z.boolean().default(false),
    })
    .prefault({}),

  dev: z
    .object({
      deploys: z
        .array(
          z.object({
            name: z.string(),
            provider: z.enum(['vercel', 'render', 'supabase']),
            /** Vercel project id or name, Render service id or name, Supabase project ref. Defaults to `name`. */
            id: z.string().optional(),
          }),
        )
        .default([]),
      /** Max deploy tiles when `deploys` is empty and everything the tokens can see is listed. */
      maxDeploys: z.number().int().min(1).max(12).default(6),
      maxPullRequests: z.number().int().min(1).max(10).default(4),
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
      /** On battery, other modules poll this many times slower (PRD N7). 1 turns it off. */
      batterySaverFactor: z.number().min(1).default(4),
      /** Yasno schedule fetch. Tomorrow's schedule usually appears in the evening. */
      scheduleMinutes: z.number().min(5).default(30),
      pingSeconds: z.number().positive().default(15),
      devSeconds: z.number().positive().default(60),
      calendarMinutes: z.number().positive().default(5),
      dtekLiveMinutes: z.number().positive().default(5),
      dtekScheduleHours: z.number().positive().default(6),
      weatherMinutes: z.number().positive().default(30),
    })
    .prefault({}),
});

export type SideScreenConfig = z.infer<typeof configSchema>;

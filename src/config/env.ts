import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  DATABASE_URL: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  A_LEADS_API_KEY: z.string().optional(),
  AIRSCALE_API_KEY: z.string().optional(),
  AIMFOX_API_KEY: z.string().optional(),
  INSTANTLY_API_KEY: z.string(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  MAKE_WEBHOOK_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);

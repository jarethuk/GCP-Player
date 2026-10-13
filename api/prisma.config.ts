import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 stopped loading .env by itself. Node's own loader does the job, so
// this needs no dotenv dependency. On Vercel the variables are already in the
// environment and there is no file to read.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * Connection URLs for the Prisma CLI (migrate, studio, db push). The
 * application never reads this file — it connects through the driver adapter
 * in `src/db.ts`.
 *
 * Migrations use the **unpooled** URL. Neon's pooled endpoint runs pgbouncer
 * in transaction mode, which cannot carry the session-level advisory locks DDL
 * needs; pointing migrate at it fails in ways that look like network flakes.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },
})

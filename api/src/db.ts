import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

/**
 * Prisma 7 runs on the query compiler, so the connection comes from a driver
 * adapter rather than from the schema.
 *
 * `@prisma/adapter-pg` rather than `@prisma/adapter-neon`: node-postgres talks
 * to Neon's pooled endpoint *and* to a plain local Postgres, so development and
 * production share one code path. The Neon adapter's WebSocket driver would
 * need a second path for local work.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * One client per process. In development `tsx watch` re-imports this module on
 * every change, and a fresh client each time leaks connections until Postgres
 * refuses new ones; stashing it on `globalThis` survives the reload. In
 * production the global is simply set once.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: env().DATABASE_URL }) })

if (env().NODE_ENV !== 'production') globalForPrisma.prisma = prisma

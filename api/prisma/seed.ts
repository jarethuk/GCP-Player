import { prisma } from '../src/db.js'
import { seedFeedSources, seedShows } from '../src/seed.js'

async function main() {
  console.log(`feed sources: ${await seedFeedSources()} ensured`)
  console.log(`shows: ${await seedShows()} pattern-matched shows ensured`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

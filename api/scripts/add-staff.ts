import { prisma } from '../src/db.js'
import { normaliseEmail } from '../src/secrets.js'

/**
 * Adds the first member of staff.
 *
 * Every other way in needs a session, and a session needs a staff row, so
 * something has to break the circle from outside the API. This is it:
 *
 *     npm run db:staff -- ada@example.com "Ada Lovelace"
 *
 * Idempotent — running it again for the same address updates the name rather
 * than failing, which is what you want when you have mistyped one.
 */
async function main(): Promise<void> {
  const [rawEmail, ...nameParts] = process.argv.slice(2)
  const name = nameParts.join(' ').trim()

  if (!rawEmail || !name) {
    console.error('Usage: npm run db:staff -- <email> <name>')
    process.exitCode = 1
    return
  }

  const email = normaliseEmail(rawEmail)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`"${rawEmail}" is not an email address.`)
    process.exitCode = 1
    return
  }

  const staff = await prisma.staff.upsert({
    where: { email },
    update: { name },
    create: { email, name },
  })

  console.log(`Staff: ${staff.name} <${staff.email}>`)
  console.log('Sign in at the dashboard with that address — the code is emailed,')
  console.log("or written to this API's log when RESEND_API_KEY is unset.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

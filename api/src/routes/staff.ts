import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AppEnv, requireStaff } from '../auth.js'
import { noCache } from '../cache.js'
import { prisma } from '../db.js'
import { normaliseEmail } from '../secrets.js'
import { toStaffDto } from '../serialise.js'

/**
 * Who may edit the catalogue.
 *
 * There is no registration: the only way to become staff is for somebody who
 * already is to add your address here. The first row comes from
 * `npm run db:staff`, which is the one path that doesn't need a session
 * because at that point nobody has one.
 *
 * Every endpoint is behind `requireStaff`, and there are no roles — anyone on
 * this list can add and remove anyone else, including themselves.
 */
export const staff = new Hono<AppEnv>()

staff.use('*', requireStaff, noCache)

const staffInput = z.object({
  email: z.email(),
  name: z.string().min(1).max(120),
})

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HTTPException(400, { message: z.prettifyError(parsed.error) })
  return parsed.data
}

staff.get('/', async (c) => {
  const rows = await prisma.staff.findMany({ orderBy: { email: 'asc' } })
  return c.json({ staff: rows.map(toStaffDto) })
})

/**
 * Adds somebody. They are signed in from the moment this returns — there is
 * nothing to accept and no password to set; the next code sent to that address
 * works.
 */
staff.post('/', async (c) => {
  const body = parse(staffInput, await c.req.json().catch(() => null))
  const email = normaliseEmail(body.email)

  const existing = await prisma.staff.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new HTTPException(409, { message: `${email} is already staff.` })

  const created = await prisma.staff.create({ data: { email, name: body.name } })
  return c.json(toStaffDto(created), 201)
})

/**
 * Editing an address is editing an identity: it moves who can sign in as this
 * person, so every session they hold is ended. Renaming alone leaves them
 * signed in.
 */
staff.patch('/:id', async (c) => {
  const body = parse(staffInput.partial(), await c.req.json().catch(() => null))
  const id = c.req.param('id')

  const before = await prisma.staff.findUnique({ where: { id } })
  if (!before) throw new HTTPException(404, { message: 'No such staff member' })

  const email = body.email ? normaliseEmail(body.email) : undefined
  if (email && email !== before.email) {
    const clash = await prisma.staff.findUnique({ where: { email }, select: { id: true } })
    if (clash) throw new HTTPException(409, { message: `${email} is already staff.` })
  }

  const emailChanged = Boolean(email && email !== before.email)

  const updated = await prisma.staff.update({
    where: { id },
    data: {
      ...(email ? { email } : {}),
      ...(body.name ? { name: body.name } : {}),
      // A pending code was sent to the old address; it must not open the new one.
      ...(emailChanged ? { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } : {}),
    },
  })

  if (emailChanged) await prisma.staffSession.deleteMany({ where: { staffId: id } })

  return c.json(toStaffDto(updated))
})

/**
 * Removes somebody, and every session they hold — the cascade on
 * `StaffSession` is why sessions are rows rather than self-contained tokens.
 *
 * Refuses on the last one. An empty staff table is a dashboard nobody can sign
 * in to and no endpoint that can fix it; recovering would mean going to the
 * database by hand.
 */
staff.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const existing = await prisma.staff.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new HTTPException(404, { message: 'No such staff member' })

  if ((await prisma.staff.count()) <= 1) {
    throw new HTTPException(409, {
      message: 'The last member of staff cannot be removed — nobody could sign in.',
    })
  }

  await prisma.staff.delete({ where: { id } })
  return c.body(null, 204)
})

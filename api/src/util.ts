/**
 * Optional keys keep their optionality but lose `undefined` from their value
 * type; required keys stay required. Mapping every key to optional would make
 * a required field look absent to Prisma.
 */
export type Defined<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>
} & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

/**
 * Drops keys whose value is `undefined`.
 *
 * This is what PATCH means — a field the caller left out is untouched, and one
 * they sent as `null` is cleared — and it is also what Prisma's input types
 * require under `exactOptionalPropertyTypes`: a key may be absent, but if it is
 * present it must carry a value. Zod's `.optional()` produces the other shape,
 * so everything on its way into Prisma goes through here.
 */
export function defined<T extends Record<string, unknown>>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Defined<T>
}

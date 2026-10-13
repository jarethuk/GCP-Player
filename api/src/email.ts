import { Resend } from 'resend'
import { env } from './env.js'

/** The alias of the published Resend template, and the one value it takes. */
const OTP_TEMPLATE = 'otp'
const OTP_VARIABLE = 'OTP_CODE'

/**
 * The slice of the Resend SDK this API uses. Narrowing it here is what lets a
 * test hand in a stand-in without constructing a real client.
 */
export interface EmailSender {
  emails: {
    send: (payload: {
      from: string
      to: string[]
      template: { id: string; variables: Record<string, string> }
    }) => Promise<{ error: { message: string } | null }>
  }
}

let client: EmailSender | null | undefined

/** Overrides the provider, for tests. Pass `undefined` to go back to Resend. */
export function setEmailSender(sender: EmailSender | null | undefined): void {
  client = sender
}

function sender(): EmailSender | null {
  if (client === undefined) {
    const key = env().RESEND_API_KEY
    client = key ? (new Resend(key) as unknown as EmailSender) : null
  }
  return client
}

/**
 * Hands the sign-in code to Resend's `otp` template — the same published
 * template the Going Somewhere API uses, on the same account.
 *
 * Sending is deliberately optional: with no API key configured the code is
 * written to the log instead, which is how local development and the test
 * suite sign in without a mail provider or a network round trip.
 *
 * Throws when the provider refuses it, because the caller cannot honestly say
 * "check your email" if nothing was sent. The reason is logged rather than
 * returned: a failure has to look the same for every address, or this endpoint
 * becomes a way to find out who has an account.
 */
export async function sendOtpCode(email: string, code: string): Promise<void> {
  const from = env().RESEND_FROM
  const provider = sender()

  if (!provider || !from) {
    // A live credential, so it is only ever written out where the person
    // reading the log is the person signing in.
    console.info(`[email] sign-in code for ${email}: ${code}`)
    return
  }

  const { error } = await provider.emails.send({
    from,
    to: [email],
    template: { id: OTP_TEMPLATE, variables: { [OTP_VARIABLE]: code } },
  })

  if (error) {
    console.error('[email] sending the sign-in code failed', { email, reason: error.message })
    throw new Error('The sign-in code could not be sent.')
  }
}

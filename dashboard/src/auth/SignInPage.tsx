import { Card, DisplayHeader } from '@gcp/web-components'
import { type FormEvent, useState } from 'react'
import { ApiError, api } from '../api/client.js'
import { Button } from '../components/Button.js'
import { TextField } from '../components/Field.js'
import { useAuth } from './AuthContext.js'

type Step = 'email' | 'code'

/**
 * Email, then a six-digit code. There is no password and no way to register:
 * an address either belongs to a member of staff or it doesn't, and the only
 * way to become one is for somebody who already is to add you.
 *
 * Asking for a code always succeeds, for any address — the API answers the
 * same way whether or not it knows you, so that this page cannot be used to
 * find out who has an account. Which means the code step is reached by
 * strangers too, and simply never works for them.
 *
 * Drawn like the web app's Settings: the header on the ground, the form in a
 * card under it.
 */
export function SignInPage() {
  const { signIn } = useAuth()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestCode = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await api.requestCode(email.trim())
      setStep('code')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reach the API.')
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      signIn(await api.verifyCode(email.trim(), code))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reach the API.')
      setBusy(false)
    }
    // No `finally`: a success unmounts this page, and setting state on the way
    // out is a warning for nothing.
  }

  const restart = () => {
    setStep('email')
    setCode('')
    setError(null)
  }

  const failure = error && (
    <p className="rounded-lg border border-ember/45 bg-ember/12 px-3 py-2.5 text-[13px] text-ember">
      {error}
    </p>
  )

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-[min(400px,100%)] flex-col gap-5">
        <div className="flex flex-col gap-3 px-1">
          <DisplayHeader eyebrow="Glass Cannon Network" title="Manage" />
          <p className="text-[13px] text-muted">Catalogue management for GCN Player.</p>
        </div>

        <Card className="p-4">
          {step === 'email' ? (
            <form className="flex flex-col gap-4" onSubmit={requestCode}>
              <TextField
                label="Email"
                type="email"
                value={email}
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
                hint="We'll send a six-digit code."
              />
              {failure}
              <Button type="submit" variant="primary" full busy={busy}>
                Send code
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={verifyCode}>
              <TextField
                label="Code"
                variant="code"
                value={code}
                required
                autoFocus
                // `one-time-code` is what gets iOS and Android to offer the code
                // straight from the message, which is most of the point of one.
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                hint={`Sent to ${email}. It expires in ten minutes.`}
              />
              {failure}
              <Button type="submit" variant="primary" full busy={busy} disabled={code.length !== 6}>
                Sign in
              </Button>
              <p className="text-center text-[12px]">
                <button type="button" className="text-sky hover:underline" onClick={restart}>
                  Use a different address
                </button>
              </p>
            </form>
          )}
        </Card>

        {import.meta.env.DEV && (
          <p className="px-1 text-center text-[12px] text-muted">
            Running locally: with no mail provider configured the code is written to the API's log
            rather than emailed.
          </p>
        )}
      </div>
    </div>
  )
}

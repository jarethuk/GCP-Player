import { useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'
import { useAddStaff, useRemoveStaff, useStaff, useUpdateStaff } from '../api/hooks.js'
import type { Staff } from '../api/types.js'
import { useAuth } from '../auth/AuthContext.js'
import { Badge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { Dialog } from '../components/Dialog.js'
import { TextField } from '../components/Field.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States.js'
import { Cell, Table } from '../components/Table.js'
import { useToast } from '../components/Toast.js'
import { formatDate, formatDateTime } from '../lib/format.js'

/**
 * Who may edit the catalogue.
 *
 * There are no roles, deliberately: everyone on this list can do everything,
 * including adding and removing each other. Adding somebody is the whole of
 * their account — there is no registration and nothing for them to accept, so
 * the next code sent to that address signs them in.
 */
export function StaffPage() {
  const { staff: me, signOut } = useAuth()
  const toast = useToast()

  const { data, isPending, isError, error, refetch } = useStaff()
  const add = useAddStaff()
  const update = useUpdateStaff()
  const remove = useRemoveStaff()

  const [editing, setEditing] = useState<Staff | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [removing, setRemoving] = useState<Staff | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const isFormOpen = isAdding || editing !== null

  useEffect(() => {
    if (!isFormOpen) return
    setEmail(editing?.email ?? '')
    setName(editing?.name ?? '')
    setFormError(null)
  }, [isFormOpen, editing])

  const closeForm = () => {
    setIsAdding(false)
    setEditing(null)
  }

  const save = async () => {
    setFormError(null)
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: { email: email.trim(), name: name.trim() },
        })
        toast.succeeded(`Saved ${name.trim()}`)

        // Changing your own address ends every session you hold, this one
        // included — so the app has to let go of a token the API has deleted
        // rather than wait for the next request to come back 401.
        if (editing.id === me?.id && email.trim().toLowerCase() !== editing.email) {
          toast.succeeded('Your address changed, so you have been signed out.')
          await signOut()
          return
        }
      } else {
        await add.mutateAsync({ email: email.trim(), name: name.trim() })
        toast.succeeded(`${name.trim()} can now sign in`)
      }
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'That could not be saved.')
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setFormError(null)

    try {
      await remove.mutateAsync(removing.id)
      toast.succeeded(`Removed ${removing.name}`)
      const wasMe = removing.id === me?.id
      setRemoving(null)
      // Removing yourself deleted your own sessions on the way out.
      if (wasMe) await signOut()
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'That could not be removed.')
    }
  }

  const rows = data?.staff ?? []

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Everyone who can edit the catalogue. There are no roles and no registration — an address is on this list or it is not."
        actions={
          <Button variant="primary" onClick={() => setIsAdding(true)}>
            Add staff
          </Button>
        }
      />

      <Panel flush>
        {isPending && <SkeletonRows rows={3} />}

        {isError && (
          <ErrorState detail={error instanceof Error ? error.message : null} onRetry={refetch} />
        )}

        {data && rows.length === 0 && (
          <EmptyState
            title="Nobody yet"
            detail="That should not be possible — you are signed in."
          />
        )}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Added</th>
                <th>Last signed in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <Cell>
                    {person.name} {person.id === me?.id && <Badge tone="sky">You</Badge>}
                  </Cell>
                  <Cell dim>{person.email}</Cell>
                  <Cell dim>{formatDate(person.createdAt)}</Cell>
                  <Cell dim>
                    {person.lastLoginAt ? formatDateTime(person.lastLoginAt) : 'Never'}
                  </Cell>
                  <Cell actions>
                    <Button variant="quiet" size="small" onClick={() => setEditing(person)}>
                      Edit
                    </Button>
                    <Button
                      variant="quiet"
                      size="small"
                      disabled={rows.length === 1}
                      onClick={() => setRemoving(person)}
                    >
                      Remove
                    </Button>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Dialog
        open={isFormOpen}
        title={editing ? 'Edit staff' : 'Add staff'}
        subtitle={
          editing
            ? 'Changing the address moves who can sign in, so every session they hold ends.'
            : 'They can sign in straight away — there is nothing to accept.'
        }
        confirmLabel={editing ? 'Save' : 'Add staff'}
        confirmDisabled={!email.trim() || !name.trim()}
        busy={add.isPending || update.isPending}
        error={formError}
        onConfirm={() => void save()}
        onClose={closeForm}
      >
        <TextField
          label="Name"
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          required
          onChange={(event) => setEmail(event.target.value)}
          hint="Where the sign-in code goes. Stored lowercase."
        />
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        title="Remove staff"
        body={
          <p>
            {removing?.name} can no longer sign in, and any session they have open stops working
            immediately.
            {removing?.id === me?.id && ' That includes this one — you will be signed out.'}
          </p>
        }
        confirmLabel="Remove"
        busy={remove.isPending}
        error={formError}
        onConfirm={() => void confirmRemove()}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}

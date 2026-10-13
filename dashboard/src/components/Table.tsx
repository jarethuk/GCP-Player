import type { ReactNode, TdHTMLAttributes } from 'react'
import styles from './Table.module.css'

export { styles as tableStyles }

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>{children}</table>
    </div>
  )
}

export interface CellProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'className'> {
  /** Right-aligned and tabular, so a column of counts lines up. */
  numeric?: boolean
  /** Right-aligned and never wrapped — the row's own buttons. */
  actions?: boolean
  /** Secondary text: a date, a guid, anything you read only if you need it. */
  dim?: boolean
  /** Caps the width and ellipsises, for a title that can run long. */
  truncate?: boolean
  children?: ReactNode
}

export function Cell({ numeric, actions, dim, truncate, children, ...rest }: CellProps) {
  const classes = [
    numeric ? styles.numeric : '',
    actions ? styles.actions : '',
    dim ? styles.dim : '',
    truncate ? styles.truncate : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <td className={classes || undefined} {...rest}>
      {children}
    </td>
  )
}

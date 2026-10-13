/**
 * What copy.ts — generated from copy/strings.yaml — needs at runtime.
 * Hand-written, and the only part of src/copy that is.
 */

declare const markdownBrand: unique symbol

/**
 * A string carrying **bold** or [links](url), the only markup the YAML
 * allows. Branded so it can't be dropped into JSX as plain text by mistake:
 * render it with <RichText>.
 */
export type Markdown = string & { readonly [markdownBrand]: true }

export function markdown(text: string): Markdown {
  return text as Markdown
}

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const rules = new Intl.PluralRules('en')

/** The CLDR form for `count`, falling back to `other` like both platforms do. */
export function plural(count: number, forms: PluralForms): string {
  return forms[rules.select(count)] ?? forms.other
}

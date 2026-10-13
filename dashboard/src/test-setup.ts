import '@testing-library/jest-dom/vitest'

/**
 * jsdom ships the `<dialog>` element but none of its methods, so anything
 * built on the real modal — which is every dialog in this app — throws on
 * mount under test.
 *
 * These stand-ins do only the part a test can observe: flip `open`, and fire
 * `close` so code listening for a dismissal still hears one. The focus trap,
 * the top layer and the backdrop are the browser's job and are not simulated.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

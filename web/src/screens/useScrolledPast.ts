import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * Whether the element has scrolled up out of view — how a bar over the page
 * knows to put a ground behind itself. Works the same whether the window
 * scrolls (the phone layout) or a column does (the wide one).
 */
export function useScrolledPast<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [past, setPast] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, past]
}

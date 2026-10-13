/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the catalogue API is. See .env.example. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

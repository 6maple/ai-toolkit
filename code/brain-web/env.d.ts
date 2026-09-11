declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare module 'virtual:brain/directory' {
  export const directory: unknown[]
}

declare module 'virtual:brain/search-documents' {
  export const searchDocuments: unknown[]
}

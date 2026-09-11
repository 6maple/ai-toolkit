import type { Plugin } from 'vite'

import { listBrainSearchDocuments } from '../lib/brain-pages'

const PUBLIC_ID = 'virtual:brain/search-documents'
const RESOLVED_ID = `\0${PUBLIC_ID}`

/** Exposes the complete, user-readable Brain catalog to the local search UI. */
export function brainSearchPlugin(): Plugin {
  return {
    name: 'brain-search',

    resolveId(id) {
      if (id === PUBLIC_ID) return RESOLVED_ID
      return undefined
    },

    async load(id) {
      if (id !== RESOLVED_ID) return undefined
      const documents = await listBrainSearchDocuments()
      return `export const searchDocuments = ${JSON.stringify(documents)}\n`
    },
  }
}

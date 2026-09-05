import type { Plugin } from 'vite'

import { listBrainPages } from '../lib/brain-pages'

function extractTitle(content: string, fallback: string): string {
  const heading = content
    .split('\n')
    .find((line) => line.startsWith('# '))
  return heading ? heading.slice(2).trim() : fallback
}

/**
 * Exposes `virtual:brain/directory` for the VitePress home page.
 *
 * The home page is a normal Markdown page; it uses a Vue component to import
 * this virtual module and render a clickable directory of all Brain pages.
 */
export function brainDirectoryPlugin(): Plugin {
  return {
    name: 'brain-directory',

    resolveId(id) {
      if (id === 'virtual:brain/directory') return id
      return undefined
    },

    async load(id) {
      if (id === 'virtual:brain/directory') {
        const pages = await listBrainPages()
        const directory = pages.map((page) => ({
          path: page.path,
          title: extractTitle(page.content, page.path),
          ...(page.tipTitle ? { tipTitle: page.tipTitle } : {}),
        }))
        return `export const directory = ${JSON.stringify(directory)}\n`
      }
      return undefined
    },
  }
}
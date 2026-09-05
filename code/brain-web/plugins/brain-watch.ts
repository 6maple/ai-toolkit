import type { Plugin } from 'vite'
import path from 'node:path'
import { homedir } from 'node:os'

const BRAIN_ROOT = process.env.BRAIN_ROOT || path.join(homedir(), '.brain-data')

/**
 * Watch ~/.brain-data and restart the VitePress dev server when Brain data
 * changes. VitePress dynamic routes are resolved at server start, so a full
 * restart is the simplest reliable way to refresh the virtual page list.
 */
export function brainWatchPlugin(): Plugin {
  return {
    name: 'brain-watch',

    configureServer(server) {
      server.watcher.add(BRAIN_ROOT)
      server.watcher.on('change', (file) => {
        const normalized = file.replaceAll('\\', '/')
        const root = BRAIN_ROOT.replaceAll('\\', '/')
        if (normalized.startsWith(root)) {
          server.restart()
        }
      })
    },
  }
}
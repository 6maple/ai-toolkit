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
      let restartTimer: NodeJS.Timeout | undefined
      let restartInFlight: Promise<void> | undefined
      let restartQueued = false

      const restart = async () => {
        if (restartInFlight) {
          restartQueued = true
          return restartInFlight
        }

        restartInFlight = (async () => {
          do {
            restartQueued = false
            await server.restart()
          } while (restartQueued)
        })().finally(() => {
          restartInFlight = undefined
        })

        return restartInFlight
      }

      const onBrainEvent = (_event: string, file: string) => {
        const relative = path.relative(BRAIN_ROOT, file)
        if (relative.startsWith('..') || path.isAbsolute(relative)) return

        clearTimeout(restartTimer)
        restartTimer = setTimeout(() => void restart(), 200)
      }

      server.watcher.add(BRAIN_ROOT)
      server.watcher.on('all', onBrainEvent)

      return () => {
        clearTimeout(restartTimer)
        server.watcher.off('all', onBrainEvent)
      }
    },
  }
}

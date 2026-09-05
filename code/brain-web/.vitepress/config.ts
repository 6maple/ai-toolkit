import { defineConfig } from 'vitepress'
import { brainDirectoryPlugin } from '../plugins/brain-directory'
import { brainWatchPlugin } from '../plugins/brain-watch'

export default defineConfig({
  title: 'brain-web',
  description: 'Local Brain data browser',
  srcDir: 'docs',
  vite: {
    plugins: [brainDirectoryPlugin(), brainWatchPlugin()],
  },
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
    sidebar: [],
    search: {
      provider: 'local',
    },
  },
})
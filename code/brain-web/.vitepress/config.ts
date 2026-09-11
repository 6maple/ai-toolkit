import { defineConfig } from 'vitepress'
import { brainDirectoryPlugin } from '../plugins/brain-directory'
import { brainSearchPlugin } from '../plugins/brain-search'
import { brainWatchPlugin } from '../plugins/brain-watch'

export default defineConfig({
  title: 'brain-web',
  description: 'Local Brain data browser',
  srcDir: 'docs',
  vite: {
    plugins: [brainDirectoryPlugin(), brainSearchPlugin(), brainWatchPlugin()],
  },
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
    sidebar: [],
  },
})

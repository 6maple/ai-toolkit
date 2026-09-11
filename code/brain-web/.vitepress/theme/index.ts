import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'

import BrainSearch from '../../components/BrainSearch.vue'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(BrainSearch),
    }),
}

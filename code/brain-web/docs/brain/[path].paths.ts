import { listBrainPages } from '../../lib/brain-pages'

export default {
  paths: async () => {
    const pages = await listBrainPages()
    return pages.map((page) => ({
      params: { path: page.path },
      content: page.content,
    }))
  },
}
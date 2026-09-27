import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeVueTagsInMarkdown, loadBrainCatalog } from './brain-pages.ts'

test('escapes Vue-like tags outside Markdown code while preserving code text', () => {
  const input = [
    'plain <scope> text',
    'inline `<inline>` code',
    '',
    '```text',
    '<fenced>',
    '```',
    '',
    '    <indented>',
    'after <tail>',
  ].join('\n')

  assert.equal(
    escapeVueTagsInMarkdown(input),
    [
      'plain &lt;scope&gt; text',
      'inline `<inline>` code',
      '',
      '```text',
      '<fenced>',
      '```',
      '',
      '    <indented>',
      'after &lt;tail&gt;',
    ].join('\n'),
  )
})

test('projects Global and Project cognition into pages and search documents', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-web-catalog-'))
  const brainRoot = path.join(temp, 'brain')
  const projectRoot = path.join(brainRoot, 'projects', 'project-1')
  const sourceRoot = path.join(temp, 'source')

  try {
    await fs.mkdir(path.join(brainRoot, 'global'), { recursive: true })
    await fs.mkdir(path.join(projectRoot, 'memories', 'knowledge'), { recursive: true })
    await fs.mkdir(sourceRoot, { recursive: true })

    await fs.writeFile(path.join(brainRoot, 'global', 'core.md'), 'global <core>\n', 'utf8')
    await fs.writeFile(path.join(projectRoot, 'core.md'), 'project `<code>` <route>\n', 'utf8')
    await fs.writeFile(
      path.join(projectRoot, 'project.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        projectId: 'project-1',
        name: 'Project One',
        sourceRoots: [sourceRoot],
      })}\n`,
      'utf8',
    )
    await fs.writeFile(
      path.join(projectRoot, 'memories', 'knowledge', 'demo.md'),
      [
        '---',
        'description: read when checking <demo>',
        'importance: high',
        '---',
        'body `<code>` <visible>',
        '',
      ].join('\n'),
      'utf8',
    )

    const catalog = await loadBrainCatalog({ brainRoot })
    const combinedPages = catalog.pages.map((page) => page.content).join('\n')
    const combinedSearch = catalog.searchDocuments
      .map((document) => `${document.path}\n${document.content}`)
      .join('\n')

    assert.ok(catalog.pages.some((page) => page.path === 'global/core'))
    assert.ok(catalog.pages.some((page) => page.path === 'projects/project-1/core'))
    assert.ok(
      catalog.pages.some(
        (page) => page.path === 'projects/project-1/memories/knowledge/demo',
      ),
    )
    assert.ok(combinedPages.includes('global &lt;core&gt;'))
    assert.ok(combinedPages.includes('project `<code>` &lt;route&gt;'))
    assert.ok(combinedPages.includes('body `<code>` &lt;visible&gt;'))
    assert.ok(combinedSearch.includes('@global/core.md'))
    assert.ok(combinedSearch.includes('@project/memories/knowledge/demo.md'))
    assert.ok(combinedSearch.includes('body `<code>` <visible>'))
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

import {
  CognitionStateStore,
  createStorageBinding,
  deriveEpistemicStatus,
  formatPublicPath,
  listProjectMetadata,
  nodeCognitionStoreFs,
  projectAccessibility,
  type CognitiveRole,
  type ProjectMetadata,
  type ScopeRef,
} from 'brain/shared'

export interface BrainPage {
  path: string
  content: string
  tipTitle?: string
}

export interface BrainSearchDocument {
  id: string
  route: string
  title: string
  path: string
  scope: 'global' | 'project'
  project?: string
  projectId?: string
  role?: CognitiveRole
  summary?: string
  importance?: string
  status?: 'active' | 'questioned'
  challenge?: string
  content: string
  metadata: string
}

export interface BrainCatalog {
  pages: BrainPage[]
  searchDocuments: BrainSearchDocument[]
}

interface MemoryMeta {
  path: string
  role: CognitiveRole
  summary: string
  importance: string
  status: 'active' | 'questioned'
  challenge?: string
  retrievability: number
  exposure: number
  body: string
  hasContent: boolean
}

interface ScopeSnapshot {
  core: string
  cycle: number
  memories: MemoryMeta[]
}

const DEFAULT_BRAIN_ROOT = process.env.BRAIN_ROOT || path.join(homedir(), '.brain-data')

async function bindingFor(projectId: string, brainRoot: string) {
  return createStorageBinding({ brainRoot, projectId })
}

async function loadScopeSnapshot(
  projectId: string,
  scope: ScopeRef,
  brainRoot: string,
): Promise<ScopeSnapshot | undefined> {
  const binding = await bindingFor(projectId, brainRoot)
  const store = new CognitionStateStore(binding, nodeCognitionStoreFs)
  const scopeSnapshot = await store.loadScope(scope)
  if (!scopeSnapshot) return undefined

  const listing = await store.listArchival(scope)
  const memories: MemoryMeta[] = []
  for (const item of listing.items) {
    const accessibility = projectAccessibility(scopeSnapshot.cycle, item.accessibility)
    memories.push({
      path: formatPublicPath(item.path),
      role: item.path.role,
      summary: item.document.description,
      importance: item.document.importance,
      status: deriveEpistemicStatus(item.epistemic),
      challenge: item.epistemic.challenge,
      retrievability: accessibility.retrievability,
      exposure: item.accessibility.exposure,
      body: item.document.body,
      hasContent: item.document.text.length > 0,
    })
  }

  return {
    core: scopeSnapshot.core.text,
    cycle: scopeSnapshot.cycle.cycle,
    memories,
  }
}

function memoryPathKey(publicPath: string, projectId?: string): string {
  return publicPath
    .replace(/^@global\//, 'global/')
    .replace(/^@project\//, projectId ? `projects/${projectId}/` : 'project/')
    .replace(/\.md$/, '')
}

function memoryLink(memory: MemoryMeta, projectId?: string): string {
  const key = memoryPathKey(memory.path, projectId)
  return `- [${escapeVueText(memory.summary)}](/brain/${key})`
}

function escapeVueText(value: string): string {
  return value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeInlineVueTags(line: string): string {
  let result = ''
  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      const next = line.indexOf('`', index)
      const end = next === -1 ? line.length : next
      result += escapeVueText(line.slice(index, end))
      index = end
      continue
    }

    let markerEnd = index
    while (markerEnd < line.length && line[markerEnd] === '`') markerEnd += 1
    const marker = line.slice(index, markerEnd)
    const close = line.indexOf(marker, markerEnd)
    if (close === -1) {
      result += escapeVueText(line.slice(index))
      break
    }
    result += line.slice(index, close + marker.length)
    index = close + marker.length
  }
  return result
}

export function escapeVueTagsInMarkdown(value: string): string {
  const lines = value.split('\n')
  let fence: { marker: string; length: number } | undefined

  return lines
    .map((line) => {
      const fenceMatch = /^( {0,3})(`{3,}|~{3,})/.exec(line)
      if (fence !== undefined) {
        if (
          fenceMatch !== null &&
          fenceMatch[2]![0] === fence.marker &&
          fenceMatch[2]!.length >= fence.length
        ) {
          fence = undefined
        }
        return line
      }

      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[2]![0]!, length: fenceMatch[2]!.length }
        return line
      }

      if (/^( {4}|\t)/.test(line)) return line
      return escapeInlineVueTags(line)
    })
    .join('\n')
}

function renderMemory(memory: MemoryMeta): string {
  return [
    `# ${basename(memory.path)}`,
    '',
    '## Metadata',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Brain path | \`${memory.path}\` |`,
    `| summary | ${escapeVueText(memory.summary)} |`,
    `| role | ${memory.role} |`,
    `| importance | ${memory.importance} |`,
    `| status | ${memory.status} |`,
    `| challenge | ${escapeVueText(memory.challenge ?? '')} |`,
    `| retrievability | ${memory.retrievability.toFixed(3)} |`,
    `| exposure | ${memory.exposure} |`,
    '',
    '## Content',
    '',
    escapeVueTagsInMarkdown(memory.body || ''),
  ].join('\n')
}

function renderOverview(title: string, scope: ScopeSnapshot): string {
  const lines = [`# ${title}`, '', escapeVueTagsInMarkdown(scope.core || '_empty_'), '', '## Memories', '']
  for (const memory of scope.memories) lines.push(memoryLink(memory))
  return lines.join('\n')
}

function renderProjectOverview(project: ProjectMetadata, scope: ScopeSnapshot): string {
  const lines = [
    `# Project ${project.name}`,
    '',
    `- projectId: \`${project.projectId}\``,
    `- sourceRoots: ${project.sourceRoots.join(', ')}`,
    '',
    '## Core',
    '',
    escapeVueTagsInMarkdown(scope.core || '_empty_'),
    '',
    '## Memories',
    '',
  ]
  for (const memory of scope.memories) lines.push(memoryLink(memory, project.projectId))
  return lines.join('\n')
}

function basename(publicPath: string): string {
  const withoutExt = publicPath.replace(/\.md$/, '')
  return withoutExt.slice(withoutExt.lastIndexOf('/') + 1)
}

function firstH1(text: string): string | undefined {
  const line = text.split('\n').find((line) => /^#\s+/.test(line))
  return line ? line.replace(/^#\s+/, '').trim() : undefined
}

export async function loadBrainCatalog(
  options: { brainRoot?: string } = {},
): Promise<BrainCatalog> {
  const brainRoot = options.brainRoot ?? DEFAULT_BRAIN_ROOT
  const pages: BrainPage[] = []
  const searchDocuments: BrainSearchDocument[] = []
  const searchIds = new Set<string>()
  const push = (pathValue: string, content: string, tipTitle?: string) =>
    pages.push({ path: pathValue, content, ...(tipTitle ? { tipTitle } : {}) })
  const pushSearch = (document: BrainSearchDocument) => {
    if (searchIds.has(document.id)) {
      throw new Error(`Duplicate Brain search document ID: ${document.id}`)
    }
    searchIds.add(document.id)
    searchDocuments.push(document)
  }

  const memorySearchDocument = (
    memory: MemoryMeta,
    pathValue: string,
    scope: BrainSearchDocument['scope'],
    context: {
      project?: ProjectMetadata
    } = {},
  ): BrainSearchDocument => {
    const route = `/brain/${pathValue}`
    const metadata = [
      memory.path,
      `scope ${scope}`,
      `role ${memory.role}`,
      `importance ${memory.importance}`,
      `status ${memory.status}`,
      `retrievability ${memory.retrievability.toFixed(3)}`,
      `exposure ${memory.exposure}`,
      memory.challenge ? `challenge ${memory.challenge}` : '',
      context.project ? `project ${context.project.name} ${context.project.projectId}` : '',
      context.project ? `sourceRoots ${context.project.sourceRoots.join(' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return {
      id: route,
      route,
      title: memory.summary,
      path: memory.path,
      scope,
      ...(context.project
        ? { project: context.project.name, projectId: context.project.projectId }
        : {}),
      role: memory.role,
      summary: memory.summary,
      importance: memory.importance,
      status: memory.status,
      ...(memory.challenge ? { challenge: memory.challenge } : {}),
      content: memory.body,
      metadata,
    }
  }

  const global = await loadScopeSnapshot('global', { kind: 'global' }, brainRoot)
  if (global) {
    if (global.memories.length > 0 || global.core.length > 0) {
      push('global/index', renderOverview('Global', global))
    }
    if (global.core.length > 0) {
      push('global/core', `# Global Core\n\n${escapeVueTagsInMarkdown(global.core)}`, firstH1(global.core))
      pushSearch({
        id: '/brain/global/core',
        route: '/brain/global/core',
        title: 'Global Core',
        path: '@global/core.md',
        scope: 'global',
        content: global.core,
        metadata: `@global/core.md\nscope global\ncycle ${global.cycle}`,
      })
    }
    for (const memory of global.memories) {
      if (memory.hasContent) {
        const pathValue = memoryPathKey(memory.path)
        push(pathValue, renderMemory(memory), firstH1(memory.body))
        pushSearch(memorySearchDocument(memory, pathValue, 'global'))
      }
    }
  }

  const projects = await listProjectMetadata(brainRoot).catch(() => [])
  for (const project of projects) {
    const scope = await loadScopeSnapshot(project.projectId, { kind: 'project' }, brainRoot)
    if (!scope) continue
    const projectPrefix = `projects/${project.projectId}`
    if (scope.memories.length > 0 || scope.core.length > 0) {
      push(`${projectPrefix}/index`, renderProjectOverview(project, scope))
    }
    if (scope.core.length > 0) {
      push(`${projectPrefix}/core`, `# Project Core\n\n${escapeVueTagsInMarkdown(scope.core)}`, firstH1(scope.core))
      pushSearch({
        id: `/brain/${projectPrefix}/core`,
        route: `/brain/${projectPrefix}/core`,
        title: `${project.name} · Project Core`,
        path: '@project/core.md',
        scope: 'project',
        project: project.name,
        projectId: project.projectId,
        content: scope.core,
        metadata: [
          '@project/core.md',
          `scope project`,
          `project ${project.name} ${project.projectId}`,
          `sourceRoots ${project.sourceRoots.join(' ')}`,
          `cycle ${scope.cycle}`,
        ].join('\n'),
      })
    }
    for (const memory of scope.memories) {
      if (memory.hasContent) {
        const pathValue = memoryPathKey(memory.path, project.projectId)
        push(pathValue, renderMemory(memory), firstH1(memory.body))
        pushSearch(memorySearchDocument(memory, pathValue, 'project', { project }))
      }
    }

  }

  return { pages, searchDocuments }
}

export async function listBrainPages(): Promise<BrainPage[]> {
  return (await loadBrainCatalog()).pages
}

export async function listBrainSearchDocuments(): Promise<BrainSearchDocument[]> {
  return (await loadBrainCatalog()).searchDocuments
}

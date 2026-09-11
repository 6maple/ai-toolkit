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
  parseSessionId,
  projectAccessibility,
  type CognitiveRole,
  type ProjectMetadata,
  type SessionId,
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
  scope: 'global' | 'project' | 'session'
  project?: string
  projectId?: string
  sessionId?: string
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

const BRAIN_ROOT = process.env.BRAIN_ROOT || path.join(homedir(), '.brain-data')

async function bindingFor(projectId: string) {
  return createStorageBinding({ brainRoot: BRAIN_ROOT, projectId })
}

async function listSessions(projectId: string): Promise<SessionId[]> {
  const binding = await bindingFor(projectId)
  const sessionsRoot = path.join(binding.brainRoot, 'projects', projectId, 'sessions')
  try {
    const entries = await fs.readdir(sessionsRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => parseSessionId(entry.name))
      .sort()
  } catch {
    return []
  }
}

async function loadScopeSnapshot(
  projectId: string,
  scope: ScopeRef,
): Promise<ScopeSnapshot | undefined> {
  const binding = await bindingFor(projectId)
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
      summary: item.document.summary,
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

function memoryPathKey(publicPath: string, projectId?: string, sessionId?: string): string {
  return publicPath
    .replace(/^@global\//, 'global/')
    .replace(/^@project\//, projectId ? `projects/${projectId}/` : 'project/')
    .replace(
      /^@session\/[^/]+\//,
      projectId && sessionId ? `projects/${projectId}/sessions/${sessionId}/` : 'session/',
    )
    .replace(/\.md$/, '')
}

function memoryLink(memory: MemoryMeta, projectId?: string, sessionId?: string): string {
  const key = memoryPathKey(memory.path, projectId, sessionId)
  return `- [${memory.summary}](/brain/${key})`
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
    `| summary | ${memory.summary} |`,
    `| role | ${memory.role} |`,
    `| importance | ${memory.importance} |`,
    `| status | ${memory.status} |`,
    `| challenge | ${memory.challenge ?? ''} |`,
    `| retrievability | ${memory.retrievability.toFixed(3)} |`,
    `| exposure | ${memory.exposure} |`,
    '',
    '## Content',
    '',
    memory.body || '',
  ].join('\n')
}

function renderOverview(title: string, scope: ScopeSnapshot): string {
  const lines = [`# ${title}`, '', scope.core || '_empty_', '', '## Memories', '']
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
    scope.core || '_empty_',
    '',
    '## Memories',
    '',
  ]
  for (const memory of scope.memories) lines.push(memoryLink(memory, project.projectId))
  return lines.join('\n')
}

function renderSessionOverview(
  sessionId: string,
  scope: ScopeSnapshot,
  projectId: string,
): string {
  const lines = [`# Session ${sessionId}`, '', scope.core || '_empty_', '', '## Memories', '']
  for (const memory of scope.memories) lines.push(memoryLink(memory, projectId, sessionId))
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

export async function loadBrainCatalog(): Promise<BrainCatalog> {
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
      sessionId?: string
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
      context.sessionId ? `session ${context.sessionId}` : '',
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
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      role: memory.role,
      summary: memory.summary,
      importance: memory.importance,
      status: memory.status,
      ...(memory.challenge ? { challenge: memory.challenge } : {}),
      content: memory.body,
      metadata,
    }
  }

  const global = await loadScopeSnapshot('global', { kind: 'global' })
  if (global) {
    if (global.memories.length > 0 || global.core.length > 0) {
      push('global/index', renderOverview('Global', global))
    }
    if (global.core.length > 0) {
      push('global/core', `# Global Core\n\n${global.core}`, firstH1(global.core))
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

  const projects = await listProjectMetadata(BRAIN_ROOT).catch(() => [])
  for (const project of projects) {
    const scope = await loadScopeSnapshot(project.projectId, { kind: 'project' })
    if (!scope) continue
    const projectPrefix = `projects/${project.projectId}`
    if (scope.memories.length > 0 || scope.core.length > 0) {
      push(`${projectPrefix}/index`, renderProjectOverview(project, scope))
    }
    if (scope.core.length > 0) {
      push(`${projectPrefix}/core`, `# Project Core\n\n${scope.core}`, firstH1(scope.core))
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

    const sessions = await listSessions(project.projectId)
    for (const sessionId of sessions) {
      const sessionScope = await loadScopeSnapshot(project.projectId, {
        kind: 'session',
        sessionId,
      })
      if (!sessionScope) continue
      const sessionPrefix = `${projectPrefix}/sessions/${sessionId}`
      if (sessionScope.memories.length > 0 || sessionScope.core.length > 0) {
        push(`${sessionPrefix}/index`, renderSessionOverview(sessionId, sessionScope, project.projectId))
      }
      if (sessionScope.core.length > 0) {
        push(`${sessionPrefix}/core`, `# Session Core\n\n${sessionScope.core}`, firstH1(sessionScope.core))
        pushSearch({
          id: `/brain/${sessionPrefix}/core`,
          route: `/brain/${sessionPrefix}/core`,
          title: `${project.name} · Session ${sessionId} Core`,
          path: `@session/${sessionId}/core.md`,
          scope: 'session',
          project: project.name,
          projectId: project.projectId,
          sessionId,
          content: sessionScope.core,
          metadata: [
            `@session/${sessionId}/core.md`,
            'scope session',
            `project ${project.name} ${project.projectId}`,
            `sourceRoots ${project.sourceRoots.join(' ')}`,
            `session ${sessionId}`,
            `cycle ${sessionScope.cycle}`,
          ].join('\n'),
        })
      }
      for (const memory of sessionScope.memories) {
        if (memory.hasContent) {
          const pathValue = memoryPathKey(memory.path, project.projectId, sessionId)
          push(pathValue, renderMemory(memory), firstH1(memory.body))
          pushSearch(memorySearchDocument(memory, pathValue, 'session', { project, sessionId }))
        }
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

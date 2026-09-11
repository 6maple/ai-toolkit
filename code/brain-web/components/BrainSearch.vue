<script setup lang="ts">
import MiniSearch from 'minisearch'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { searchDocuments } from 'virtual:brain/search-documents'

interface SearchDocument {
  id: string
  route: string
  title: string
  path: string
  scope: 'global' | 'project' | 'session'
  project?: string
  projectId?: string
  sessionId?: string
  role?: string
  summary?: string
  importance?: string
  status?: 'active' | 'questioned'
  challenge?: string
  content: string
  metadata: string
}

interface SearchViewResult extends SearchDocument {
  score: number
  snippet: string
}

const documents = searchDocuments as SearchDocument[]
const documentsById = new Map(documents.map((document) => [document.id, document]))
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

function tokenize(text: string): string[] {
  const normalized = text.toLocaleLowerCase()
  const tokens = new Set<string>()

  for (const segment of segmenter.segment(normalized)) {
    if (segment.isWordLike) tokens.add(segment.segment)
  }

  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const characters = Array.from(match[0])
    for (let index = 0; index + 1 < characters.length; index += 1) {
      tokens.add(`${characters[index]}${characters[index + 1]}`)
    }
  }

  return [...tokens]
}

const index = new MiniSearch<SearchDocument>({
  fields: ['title', 'summary', 'content', 'path', 'metadata'],
  storeFields: [
    'route',
    'title',
    'path',
    'scope',
    'project',
    'projectId',
    'sessionId',
    'role',
    'summary',
    'importance',
    'status',
    'challenge',
  ],
  tokenize,
  searchOptions: {
    boost: { title: 5, summary: 3, path: 2, metadata: 1.5 },
    combineWith: 'AND',
    prefix: true,
    fuzzy: 0.15,
  },
})

index.addAll(documents)

const open = ref(false)
const query = ref('')
const input = ref<HTMLInputElement>()

function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_>#|\[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippetFor(document: SearchDocument, searchQuery: string): string {
  const text = plainText([document.summary, document.content, document.metadata].filter(Boolean).join(' '))
  if (!text) return document.path

  const terms = tokenize(searchQuery).sort((a, b) => b.length - a.length)
  const lower = text.toLocaleLowerCase()
  const position = terms.reduce((best, term) => {
    const found = lower.indexOf(term)
    return found >= 0 && (best < 0 || found < best) ? found : best
  }, -1)
  const start = Math.max(0, position < 0 ? 0 : position - 55)
  const end = Math.min(text.length, start + 180)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

const results = computed<SearchViewResult[]>(() => {
  const value = query.value.trim()
  if (!value) return []

  return index
    .search(value)
    .slice(0, 30)
    .flatMap((result) => {
      const document = documentsById.get(String(result.id))
      return document ? [{ ...document, score: result.score, snippet: snippetFor(document, value) }] : []
    })
})

function openSearch() {
  open.value = true
  void nextTick(() => input.value?.focus())
}

function closeSearch() {
  open.value = false
  query.value = ''
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing =
    target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    open.value ? closeSearch() : openSearch()
  } else if (event.key === '/' && !typing && !open.value) {
    event.preventDefault()
    openSearch()
  } else if (event.key === 'Escape' && open.value) {
    closeSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <button class="brain-search-button" type="button" aria-label="Search Brain" @click="openSearch">
    <span aria-hidden="true">⌕</span>
    <span class="brain-search-label">Search</span>
    <kbd>⌘ K</kbd>
  </button>

  <Teleport to="body">
    <div v-if="open" class="brain-search-overlay" role="presentation" @mousedown.self="closeSearch">
      <section class="brain-search-dialog" role="dialog" aria-modal="true" aria-label="Search Brain">
        <header class="brain-search-header">
          <span class="brain-search-icon" aria-hidden="true">⌕</span>
          <input
            ref="input"
            v-model="query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search core, memories, paths, projects…"
            aria-label="Search Brain content"
          />
          <button type="button" class="brain-search-close" aria-label="Close search" @click="closeSearch">
            Esc
          </button>
        </header>

        <div class="brain-search-results" aria-live="polite">
          <p v-if="!query.trim()" class="brain-search-state">
            Search {{ documents.length }} Brain documents by content, summary, path, project, or metadata.
          </p>
          <p v-else-if="results.length === 0" class="brain-search-state">No matching Brain content.</p>

          <a
            v-for="result in results"
            :key="result.id"
            class="brain-search-result"
            :href="result.route"
            @click="closeSearch"
          >
            <span class="brain-search-result-head">
              <strong>{{ result.title }}</strong>
              <span class="brain-search-badges">
                <small>{{ result.scope }}</small>
                <small v-if="result.role">{{ result.role }}</small>
                <small v-if="result.status === 'questioned'" class="questioned">questioned</small>
              </span>
            </span>
            <span class="brain-search-path">{{ result.path }}</span>
            <span v-if="result.project || result.sessionId" class="brain-search-context">
              {{ [result.project, result.sessionId && `session ${result.sessionId}`].filter(Boolean).join(' · ') }}
            </span>
            <span class="brain-search-snippet">{{ result.snippet }}</span>
          </a>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.brain-search-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: 0.75rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-alt);
  cursor: pointer;
  pointer-events: auto;
}

.brain-search-button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.brain-search-button kbd {
  padding: 0.05rem 0.3rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font: inherit;
  font-size: 0.72rem;
}

.brain-search-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(14vh, 8rem) 1rem 1rem;
  background: rgb(0 0 0 / 45%);
  backdrop-filter: blur(3px);
}

.brain-search-dialog {
  width: min(760px, 100%);
  max-height: min(720px, 78vh);
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-5);
}

.brain-search-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.brain-search-icon {
  font-size: 1.25rem;
  color: var(--vp-c-text-2);
}

.brain-search-header input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  font-size: 1rem;
}

.brain-search-close {
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-alt);
  cursor: pointer;
}

.brain-search-results {
  max-height: calc(min(720px, 78vh) - 60px);
  overflow-y: auto;
  padding: 0.5rem;
}

.brain-search-state {
  margin: 0;
  padding: 1.8rem 1rem;
  color: var(--vp-c-text-2);
  text-align: center;
}

.brain-search-result {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border-radius: 8px;
  color: var(--vp-c-text-1);
  text-decoration: none;
}

.brain-search-result:hover,
.brain-search-result:focus-visible {
  outline: none;
  background: var(--vp-c-bg-soft);
}

.brain-search-result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.brain-search-badges {
  display: flex;
  gap: 0.3rem;
}

.brain-search-badges small {
  padding: 0.08rem 0.35rem;
  border-radius: 999px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-alt);
}

.brain-search-badges .questioned {
  color: var(--vp-c-warning-1);
}

.brain-search-path,
.brain-search-context {
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}

.brain-search-context {
  color: var(--vp-c-text-3);
}

.brain-search-snippet {
  color: var(--vp-c-text-2);
  font-size: 0.86rem;
  line-height: 1.45;
}

@media (max-width: 640px) {
  .brain-search-label,
  .brain-search-button kbd {
    display: none;
  }

  .brain-search-button {
    margin-left: 0.3rem;
  }

  .brain-search-overlay {
    padding-top: 4.5rem;
  }

  .brain-search-result-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>

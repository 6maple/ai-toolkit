<script setup lang="ts">
import { computed } from 'vue'
import { directory } from 'virtual:brain/directory'

interface DirectoryItem {
  path: string
  title: string
  tipTitle?: string
}

interface SessionGroup {
  id: string
  tipTitle?: string
  items: DirectoryItem[]
}

interface ProjectGroup {
  id: string
  name: string
  tipTitle?: string
  items: DirectoryItem[]
  sessions: SessionGroup[]
}

const props = defineProps<{
  title?: string
}>()

function projectIdOf(path: string): string | undefined {
  const match = /^projects\/([^/]+)\//.exec(path)
  return match?.[1]
}

function sessionIdOf(path: string): string | undefined {
  const match = /^projects\/[^/]+\/sessions\/([^/]+)\//.exec(path)
  return match?.[1]
}

const groups = computed(() => {
  const globalItems: DirectoryItem[] = []
  const projectMap = new Map<string, ProjectGroup>()

  for (const item of directory as DirectoryItem[]) {
    if (item.path.startsWith('global/')) {
      globalItems.push(item)
      continue
    }

    const projectId = projectIdOf(item.path)
    if (!projectId) continue

    let project = projectMap.get(projectId)
    if (!project) {
      project = { id: projectId, name: projectId, items: [], sessions: [] }
      projectMap.set(projectId, project)
    }

    const sessionId = sessionIdOf(item.path)
    if (sessionId) {
      let session = project.sessions.find((s) => s.id === sessionId)
      if (!session) {
        session = { id: sessionId, items: [] }
        project.sessions.push(session)
      }
      if (item.path.endsWith('/index')) {
        session.tipTitle = item.tipTitle
      }
      session.items.push(item)
    } else {
      project.items.push(item)
      if (item.path.endsWith('/index')) {
        project.name = item.title
        project.tipTitle = item.tipTitle
      }
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  for (const project of projects) {
    project.sessions.sort((a, b) => a.id.localeCompare(b.id))
  }

  return {
    global: globalItems,
    projects,
  }
})
</script>

<template>
  <div id="brain-directory" class="brain-directory">
    <h2 class="brain-directory-title">{{ props.title ?? 'Brain Directory' }}</h2>

    <section class="brain-area">
      <h3 class="brain-area-title">Global</h3>
      <div v-if="groups.global.length" class="brain-cards">
        <a
          v-for="item in groups.global"
          :key="item.path"
          class="brain-card"
          :href="`/brain/${item.path}`"
        >
          <span class="brain-card-title">{{ item.title }}</span>
          <span v-if="item.tipTitle" class="brain-card-tip">{{ item.tipTitle }}</span>
          <code class="brain-card-path">{{ item.path }}</code>
        </a>
      </div>
      <p v-else class="brain-empty">No global data.</p>
    </section>

    <section class="brain-area">
      <h3 class="brain-area-title">Projects</h3>
      <div v-if="groups.projects.length" class="brain-projects">
        <details v-for="project in groups.projects" :key="project.id" class="brain-project">
          <summary class="brain-project-summary">
            <span class="brain-project-name">{{ project.name }}</span>
            <code class="brain-project-id">{{ project.id }}</code>
          </summary>

          <div class="brain-project-body">
            <div v-if="project.items.length" class="brain-cards">
              <a
                v-for="item in project.items"
                :key="item.path"
                class="brain-card"
                :href="`/brain/${item.path}`"
              >
                <span class="brain-card-title">{{ item.title }}</span>
                <span v-if="item.tipTitle" class="brain-card-tip">{{ item.tipTitle }}</span>
                <code class="brain-card-path">{{ item.path }}</code>
              </a>
            </div>

            <div v-for="session in project.sessions" :key="session.id" class="brain-session">
              <h4 class="brain-session-title">{{ session.id }}</h4>
              <div class="brain-cards">
                <a
                  v-for="item in session.items"
                  :key="item.path"
                  class="brain-card"
                  :href="`/brain/${item.path}`"
                >
                  <span class="brain-card-title">{{ item.title }}</span>
                  <span v-if="item.tipTitle" class="brain-card-tip">{{ item.tipTitle }}</span>
                  <code class="brain-card-path">{{ item.path }}</code>
                </a>
              </div>
            </div>

            <p v-if="!project.items.length && !project.sessions.length" class="brain-empty">
              No project data.
            </p>
          </div>
        </details>
      </div>
      <p v-else class="brain-empty">No projects found.</p>
    </section>
  </div>
</template>

<style scoped>
.brain-directory {
  margin-top: 2rem;
}

.brain-directory-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.brain-area {
  margin-bottom: 2rem;
}

.brain-area-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--vp-c-text-1);
}

.brain-projects {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.brain-project {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.brain-project-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.brain-project-summary::-webkit-details-marker {
  display: none;
}

.brain-project-summary::before {
  content: '▸';
  color: var(--vp-c-brand-1);
  transition: transform 0.2s;
  display: inline-block;
}

.brain-project[open] > .brain-project-summary::before {
  transform: rotate(90deg);
}

.brain-project-name {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.brain-project-id {
  font-size: 0.8em;
  opacity: 0.6;
}



.brain-project-body {
  padding: 0 0.9rem 0.9rem;
  border-top: 1px solid var(--vp-c-divider);
}

.brain-session {
  margin-top: 1rem;
}

.brain-session-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--vp-c-text-2);
}

.brain-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.brain-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    transform 0.2s;
}

.brain-card:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft-up);
  transform: translateY(-1px);
}

.brain-card-title {
  font-weight: 600;
}

.brain-card-tip {
  font-size: 0.85em;
  color: var(--vp-c-text-2);
  opacity: 0.8;
}

.brain-card-path {
  font-size: 0.8em;
  opacity: 0.65;
  overflow-wrap: anywhere;
}

.brain-empty {
  color: var(--vp-c-text-2);
}
</style>
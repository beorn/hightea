<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  canvasSrc: { type: String, default: '/inkx/examples/canvas.html' },
  domSrc: { type: String, default: '/inkx/examples/dom.html' },
  xtermSrc: { type: String, default: '/inkx/examples/xterm.html' },
  height: { type: Number, default: 400 },
})

const activeTab = ref('dom')

const tabs = [
  {
    id: 'canvas',
    label: 'Canvas 2D',
    description: 'Pixel-perfect rendering to HTML5 Canvas. Fast batch updates, single DOM element, export to image.',
  },
  {
    id: 'dom',
    label: 'DOM',
    description: 'Semantic HTML elements. Native text selection, screen reader accessible, CSS hover/focus states.',
  },
  {
    id: 'xterm',
    label: 'Terminal',
    description: 'ANSI escape sequences rendered via xterm.js. Identical output to a real terminal emulator.',
  },
]

const activeDescription = computed(() => {
  return tabs.find(t => t.id === activeTab.value)?.description ?? ''
})

function iframeSrc(tabId) {
  switch (tabId) {
    case 'canvas': return props.canvasSrc
    case 'dom': return props.domSrc
    case 'xterm': return props.xtermSrc
    default: return ''
  }
}
</script>

<template>
  <ClientOnly>
    <div class="live-demo">
      <div class="live-demo-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['live-demo-tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
          :title="tab.description"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="live-demo-viewport" :style="{ height: height + 'px' }">
        <iframe
          v-for="tab in tabs"
          :key="tab.id"
          v-show="activeTab === tab.id"
          :src="iframeSrc(tab.id)"
          class="live-demo-iframe"
          frameborder="0"
          :title="`inkx ${tab.label} render target demo`"
          loading="lazy"
          @error="() => {}"
        />
        <div class="live-demo-fallback">
          <p>If the demo is blank, build the examples first:</p>
          <code>bun run examples/web/build.ts</code>
        </div>
      </div>

      <p class="live-demo-description">{{ activeDescription }}</p>
    </div>
  </ClientOnly>
</template>

<style scoped>
.live-demo {
  margin: 1.5rem 0;
  max-width: 800px;
}

.live-demo-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--vp-c-divider);
}

.live-demo-tab {
  padding: 0.5rem 1.25rem;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
  font-family: var(--vp-font-family-base);
}

.live-demo-tab:hover {
  color: var(--vp-c-text-1);
}

.live-demo-tab.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.live-demo-viewport {
  position: relative;
  background: #1e1e1e;
  border: 1px solid var(--vp-c-divider);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

.live-demo-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #1e1e1e;
}

.live-demo-fallback {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem;
  background: rgba(30, 30, 30, 0.95);
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.live-demo-viewport:hover .live-demo-fallback {
  opacity: 1;
}

.live-demo-fallback code {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.15rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  font-size: 0.8rem;
}

.live-demo-description {
  margin-top: 0.75rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.5;
}
</style>

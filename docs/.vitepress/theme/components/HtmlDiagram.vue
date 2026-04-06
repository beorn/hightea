<script setup lang="ts">
import { onMounted, ref } from "vue"
import diagramTokens from "../diagram-tokens.css?raw"

const props = defineProps<{
  html: string
}>()

const hostRef = ref<HTMLElement>()

onMounted(() => {
  if (!hostRef.value) return
  const shadow = hostRef.value.attachShadow({ mode: "open" })
  // Inject design tokens (typography, colors, spacing) + diagram HTML
  shadow.innerHTML = `<style>${diagramTokens}</style><div class="diagram-card">${props.html}</div>`
})
</script>

<template>
  <div ref="hostRef" class="html-diagram" />
</template>

<style>
.html-diagram {
  margin: 16px 0;
  border-radius: 12px;
  overflow: hidden;
}
</style>

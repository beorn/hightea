<script setup lang="ts">
defineProps<{
  html: string
}>()
</script>

<template>
  <div class="html-diagram" v-html="html" />
</template>

<style>
.html-diagram {
  margin: 16px 0;
  border-radius: 12px;
  overflow: hidden;
}

/* Override diagram body styles when embedded inline */
.html-diagram body {
  min-height: unset;
  padding: 0;
}
</style>

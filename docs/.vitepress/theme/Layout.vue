<script setup lang="ts">
import DefaultTheme from "vitepress/theme"
import { useData } from "vitepress"

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <template #home-hero-info-before>
      <div v-if="frontmatter.layout === 'home'" class="alpha-banner">
        <strong>WORK IN PROGRESS</strong>
        <span>APIs may change</span>
      </div>
    </template>
  </Layout>
</template>

<style>
.VPHero .container {
  position: relative;
}
.alpha-banner {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.8em;
  line-height: 1.5;
  pointer-events: none;
}
.alpha-banner strong {
  font-weight: 700;
}
.alpha-banner span {
  font-weight: 500;
}
@media (max-width: 768px) {
  .alpha-banner {
    display: none;
  }
}
</style>

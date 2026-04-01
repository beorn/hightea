import DefaultTheme from "vitepress/theme"
import Layout from "./Layout.vue"
import "@bearly/vitepress-enrich/css/tooltip.css"
import "@bearly/vitepress-enrich/css/glossary-links.css"

export default {
  extends: DefaultTheme,
  Layout,
}

import DefaultTheme from "vitepress/theme"
import Layout from "./Layout.vue"
import HtmlDiagram from "./components/HtmlDiagram.vue"
import "vitepress-enrich/css/tooltip.css"
import "vitepress-enrich/css/glossary-links.css"

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("HtmlDiagram", HtmlDiagram)
  },
}

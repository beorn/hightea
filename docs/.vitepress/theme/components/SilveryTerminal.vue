<!--
  SilveryTerminal — hero image slot component for silvery.dev

  macOS-Terminal.app-fidelity mockup showing a coding agent session.
  Renders into VitePress's built-in `home-hero-image` slot.

  Design constraints:
  - Thin uniform chrome bezel
  - Title bar: macOS traffic lights + left-aligned bold title
  - ANSI-only interior (6-color palette, monospace grid)
  - No gradients, shadows, or rounded highlights inside
  - No cursor inside (tagline cursor is the only one on the page)
  - Terminal interior stays dark in both site modes
-->

<template>
  <div class="silvery-terminal">
    <div class="silvery-terminal__titlebar">
      <div class="silvery-terminal__dots">
        <span class="silvery-terminal__dot silvery-terminal__dot--red"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--yellow"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--green"></span>
      </div>
      <div class="silvery-terminal__title">silvery-agent — ~/silvery</div>
    </div>

    <div class="silvery-terminal__body">
      <div class="silvery-terminal__line">
        <span class="t-prompt">❯</span>
        <span class="t-command"> add a blinking cursor after the tagline</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <div class="silvery-terminal__line">
        <span class="t-think">⏺</span>
        <span class="t-dim"> Planning the change...</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <div class="silvery-terminal__line">
        <span class="t-tool">●</span>
        <span> Read </span>
        <span class="t-path">.vitepress/theme/custom.css</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-ok">✓</span>
        <span class="t-dim"> found </span>
        <span class="t-path">.VPHero .tagline</span>
        <span class="t-dim"> selector</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <div class="silvery-terminal__line">
        <span class="t-tool">●</span>
        <span> Edit </span>
        <span class="t-path">.vitepress/theme/custom.css</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-dim">  + </span>
        <span>tagline::after with blink animation</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-dim">  + </span>
        <span>1Hz steps(1), currentColor</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-ok">✓</span>
        <span class="t-dim"> applied · 12 insertions</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <div class="silvery-terminal__line">
        <span class="t-tool">●</span>
        <span class="t-dim"> Blink lands at end of tagline.</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-dim">  One cursor per page · matches design doc.</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <div class="silvery-terminal__line">
        <span class="t-prompt">❯</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ----- Terminal wrapper ----- */
.silvery-terminal {
  /* Stays dark in both site modes */
  background: #0f1419;
  color: #d6d9e0;

  /* Thin uniform chrome bezel */
  border: 3px solid #3f4551;
  border-radius: 10px;

  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 4px 24px rgba(0, 0, 0, 0.35);

  font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.45; /* slightly loosened for readability */

  overflow: hidden;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

/* ----- Title bar ----- */
.silvery-terminal__titlebar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: #1a1f27;
  border-bottom: 1px solid #2a2f39;
}

.silvery-terminal__dots {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.silvery-terminal__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.silvery-terminal__dot--red {
  background: #ff5f57;
}
.silvery-terminal__dot--yellow {
  background: #febc2e;
}
.silvery-terminal__dot--green {
  background: #28c840;
}

/* Title — bold, high-contrast, left-aligned */
.silvery-terminal__title {
  font-size: 12px;
  color: #e6e9ef;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* ----- Body ----- */
.silvery-terminal__body {
  padding: 14px 16px 16px;
}

.silvery-terminal__line {
  display: block;
  white-space: pre;
}

.silvery-terminal__line.t-spacer {
  height: 0.5em; /* visual paragraph spacing, terminal-style blank line */
}

/* ----- Token colors (6-color ANSI-ish palette) ----- */

/* Prompt glyph `❯` — muted */
.t-prompt {
  color: #7a8090;
}

/* User command text — bright white */
.t-command {
  color: #f1f3f7;
  font-weight: 500;
}

/* Thinking state `⏺` — silver-blue accent */
.t-think {
  color: #8ea4c8;
}

/* Tool call bullet `●` — cool cyan */
.t-tool {
  color: #7dd3c0;
}

/* Success `✓` — mint-silver green */
.t-ok {
  color: #8bc79a;
}

/* File paths and key identifiers — warm sand (pops against dark) */
.t-path {
  color: #e6b872;
}

/* Dim text — muted for commentary, bullets, continuation lines */
.t-dim {
  color: #8a90a2;
}

/* Responsive */
@media (max-width: 640px) {
  .silvery-terminal {
    font-size: 12px;
    max-width: 100%;
  }
  .silvery-terminal__body {
    padding: 12px 14px 14px;
  }
}
</style>

'use client';

import { Global, css } from '@emotion/react';

export function GlobalStyles() {
  return <Global styles={globalStyles} />;
}

const globalStyles = css`
  @font-face {
    font-family: 'Pretendard Variable';
    font-weight: 45 920;
    font-style: normal;
    font-display: swap;
    src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
  }

  :root {
    color-scheme: light;

    /* Paper & Slate · light */
    --color-canvas: #f7f9fa;
    --color-surface: #ffffff;
    --color-surface-muted: #eef2f4;
    --color-surface-raised: #ffffff;
    --color-nav: rgba(255, 255, 255, 0.92);
    --color-text-primary: #1c242b;
    --color-text-secondary: #5e6973;
    --color-border: #d9e0e5;
    --color-border-strong: #89959f;
    --color-action: #2d657a;
    --color-action-hover: #224f61;
    --color-action-subtle: #e7f0f3;
    --color-action-subtle-hover: #dce9ed;
    --color-action-border: #86adbc;
    --color-on-action: #ffffff;
    --color-focus: #477f93;
    --color-neutral-subtle: #eef2f4;
    --color-shadow: rgba(28, 36, 43, 0.08);
    --color-selection: rgba(45, 101, 122, 0.2);

    --color-success: #176b50;
    --color-success-bg: #e9f5ef;
    --color-success-border: #9bcdb9;
    --color-warning: #765713;
    --color-warning-bg: #fff3d2;
    --color-warning-border: #dfc77d;
    --color-danger: #9c3f42;
    --color-danger-bg: #fceced;
    --color-danger-border: #dfaaac;

    /* Compatibility aliases for the current component layer. */
    --canvas: var(--color-canvas);
    --surface: var(--color-surface);
    --surface-muted: var(--color-surface-muted);
    --boundary: var(--color-border-strong);
    --text-primary: var(--color-text-primary);
    --text-secondary: var(--color-text-secondary);
    --proof: var(--color-action);
    --proof-hover: var(--color-action-hover);
    --success: var(--color-success);
    --warning: var(--color-warning);
    --danger: var(--color-danger);
    --line: var(--color-border);
    --font-pretendard: 'Pretendard Variable', Pretendard, -apple-system,
      BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-family: var(--font-pretendard);
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      color-scheme: dark;
      --color-canvas: #272d32;
      --color-surface: #30373d;
      --color-surface-muted: #394149;
      --color-surface-raised: #394149;
      --color-nav: rgba(39, 45, 50, 0.92);
      --color-text-primary: #f3f5f6;
      --color-text-secondary: #b5bec5;
      --color-border: #4a545c;
      --color-border-strong: #75828c;
      --color-action: #86b4c4;
      --color-action-hover: #a1c7d4;
      --color-action-subtle: #344951;
      --color-action-subtle-hover: #3c555e;
      --color-action-border: #638a99;
      --color-on-action: #172126;
      --color-focus: #9ec6d3;
      --color-neutral-subtle: #394149;
      --color-shadow: rgba(12, 16, 19, 0.18);
      --color-selection: rgba(134, 180, 196, 0.24);

      --color-success: #8ad2b5;
      --color-success-bg: #30453d;
      --color-success-border: #477060;
      --color-warning: #e5c36f;
      --color-warning-bg: #483f2e;
      --color-warning-border: #6e5e3c;
      --color-danger: #eba09f;
      --color-danger-bg: #4d3638;
      --color-danger-border: #765054;
    }
  }

  :root[data-theme='dark'] {
    color-scheme: dark;
    --color-canvas: #272d32;
    --color-surface: #30373d;
    --color-surface-muted: #394149;
    --color-surface-raised: #394149;
    --color-nav: rgba(39, 45, 50, 0.92);
    --color-text-primary: #f3f5f6;
    --color-text-secondary: #b5bec5;
    --color-border: #4a545c;
    --color-border-strong: #75828c;
    --color-action: #86b4c4;
    --color-action-hover: #a1c7d4;
    --color-action-subtle: #344951;
    --color-action-subtle-hover: #3c555e;
    --color-action-border: #638a99;
    --color-on-action: #172126;
    --color-focus: #9ec6d3;
    --color-neutral-subtle: #394149;
    --color-shadow: rgba(12, 16, 19, 0.18);
    --color-selection: rgba(134, 180, 196, 0.24);

    --color-success: #8ad2b5;
    --color-success-bg: #30453d;
    --color-success-border: #477060;
    --color-warning: #e5c36f;
    --color-warning-bg: #483f2e;
    --color-warning-border: #6e5e3c;
    --color-danger: #eba09f;
    --color-danger-bg: #4d3638;
    --color-danger-border: #765054;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    min-height: 100%;
  }

  html {
    background: var(--canvas);
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  body,
  h1,
  h2,
  h3,
  h4,
  p,
  figure,
  blockquote,
  dl,
  dd {
    margin: 0;
  }

  body {
    min-width: 320px;
    color: var(--text-primary);
    background: var(--canvas);
    font-family: var(--font-pretendard);
    line-height: 1.5;
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button,
  input,
  textarea,
  select {
    margin: 0;
    color: inherit;
    font: inherit;
  }

  button,
  select {
    text-transform: none;
  }

  button,
  [role='button'] {
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 3px;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  img,
  picture,
  video,
  canvas,
  svg {
    display: block;
    max-width: 100%;
  }

  table {
    border-collapse: collapse;
    border-spacing: 0;
  }

  [hidden] {
    display: none !important;
  }

  ::selection {
    color: var(--text-primary);
    background: var(--color-selection);
  }

  @media (prefers-reduced-motion: reduce) {
    html:focus-within {
      scroll-behavior: auto;
    }

    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

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
    color-scheme: dark;
    --canvas: #0b0f18;
    --surface: #141b29;
    --boundary: #586985;
    --text-primary: #f2f5fa;
    --text-secondary: #a9b4c6;
    --proof: #9baeff;
    --proof-hover: #b4c1ff;
    --success: #67d7b0;
    --warning: #f2c66d;
    --danger: #ff8f92;
    --line: rgba(88, 105, 133, 0.46);
    --font-pretendard: 'Pretendard Variable', Pretendard, -apple-system,
      BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-family: var(--font-pretendard);
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
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
    outline: 2px solid var(--proof);
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
    background: rgba(155, 174, 255, 0.28);
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

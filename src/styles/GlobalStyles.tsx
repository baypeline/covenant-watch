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
    --ink: #f6f8f5;
    --muted: #98a39e;
    --line: rgba(255, 255, 255, 0.09);
    --green: #8ef0b0;
    --green-strong: #35d978;
    --orange: #ffb36b;
    --red: #ff7c72;
    --surface: rgba(20, 27, 25, 0.82);
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
    background: #09100e;
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
    color: var(--ink);
    background: #09100e;
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
    outline: 2px solid var(--green);
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
    color: var(--ink);
    background: rgba(142, 240, 176, 0.28);
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

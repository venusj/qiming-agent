/** 令牌的 TS 镜像，供 Tailwind theme 与 JS 逻辑引用 */
export const tokens = {
  color: {
    bg: {
      paper: 'var(--bg-paper)',
      paperDark: 'var(--bg-paper-dark)',
      silk: 'var(--bg-silk)',
      wood: 'var(--bg-wood)',
      woodLight: 'var(--bg-wood-light)',
    },
    text: {
      ink: 'var(--text-ink)',
      inkLight: 'var(--text-ink-light)',
      inkReverse: 'var(--text-ink-reverse)',
    },
    accent: {
      cinnabar: 'var(--accent-cinnabar)',
      cinnabarHover: 'var(--accent-cinnabar-hover)',
      lapis: 'var(--accent-lapis)',
      gold: 'var(--accent-gold)',
      jade: 'var(--accent-jade)',
      jadeHover: 'var(--accent-jade-hover)',
    },
    border: {
      ancient: 'var(--border-ancient)',
      ink: 'var(--border-ink)',
    },
  },
} as const;

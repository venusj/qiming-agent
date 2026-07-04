import type { Config } from 'tailwindcss';

/** Tailwind theme 扩展，desktop 的 tailwind.config 引入 */
export const tailwindTheme: Pick<Config, 'theme'> = {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: 'var(--bg-paper)', dark: 'var(--bg-paper-dark)' },
        silk: 'var(--bg-silk)',
        wood: { DEFAULT: 'var(--bg-wood)', light: 'var(--bg-wood-light)' },
        ink: { DEFAULT: 'var(--text-ink)', light: 'var(--text-ink-light)', reverse: 'var(--text-ink-reverse)' },
        cinnabar: { DEFAULT: 'var(--accent-cinnabar)', hover: 'var(--accent-cinnabar-hover)' },
        lapis: 'var(--accent-lapis)',
        gold: 'var(--accent-gold)',
        jade: { DEFAULT: 'var(--accent-jade)', hover: 'var(--accent-jade-hover)' },
        'border-ancient': 'var(--border-ancient)',
        'border-ink': 'var(--border-ink)',
      },
      fontFamily: {
        cn: ['var(--font-family-cn)'],
        en: ['var(--font-family-en)'],
      },
      fontSize: {
        xs: ['var(--font-size-xs)', 'var(--line-height-tight)'],
        sm: ['var(--font-size-sm)', 'var(--line-height-tight)'],
        base: ['var(--font-size-base)', 'var(--line-height-relaxed)'],
        lg: ['var(--font-size-lg)', 'var(--line-height-relaxed)'],
        xl: ['var(--font-size-xl)', 'var(--line-height-relaxed)'],
        '2xl': ['var(--font-size-2xl)', 'var(--line-height-tight)'],
        '3xl': ['var(--font-size-3xl)', 'var(--line-height-tight)'],
      },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)',
        4: 'var(--space-4)', 6: 'var(--space-6)', 8: 'var(--space-8)',
        12: 'var(--space-12)', 16: 'var(--space-16)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)', base: 'var(--radius-base)',
        lg: 'var(--radius-lg)', full: 'var(--radius-full)',
      },
      boxShadow: {
        'ink-sm': 'var(--shadow-ink-sm)', 'ink-md': 'var(--shadow-ink-md)',
        'ink-lg': 'var(--shadow-ink-lg)', 'ink-xl': 'var(--shadow-ink-xl)',
      },
      transitionTimingFunction: {
        'brush-out': 'var(--ease-brush-out)',
        'brush-in': 'var(--ease-brush-in)',
        scroll: 'var(--ease-scroll)',
        ink: 'var(--ease-ink)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)', fast: 'var(--duration-fast)',
        medium: 'var(--duration-medium)', slow: 'var(--duration-slow)',
        ink: 'var(--duration-ink)',
      },
    },
  },
};

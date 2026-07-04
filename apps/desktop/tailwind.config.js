/** @type {import('tailwindcss').Config} */
import { tailwindTheme } from '@qiming/design-tokens/tailwind-theme';

export default {
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
    '../packages/ui/src/**/*.{ts,tsx}',
  ],
  ...tailwindTheme,
};

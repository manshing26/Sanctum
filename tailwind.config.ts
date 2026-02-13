import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--accent-foreground) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      boxShadow: {
        soft: '0 12px 35px rgb(0 0 0 / 0.35)',
      },
    },
  },
};

export default config;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        term: {
          bg: '#000000',
          panel: '#0a0a0a',
          border: '#262626',
          amber: '#ff9800',
          amberDim: '#b36a00',
          up: '#00c853',
          down: '#ff1744',
          text: '#d4d4d4',
          dim: '#7a7a7a'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
        label: ['"Arial Narrow"', '"Helvetica Neue"', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
}

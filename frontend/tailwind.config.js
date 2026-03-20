/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        brand: ['"SF Pro Display"', 'Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body:  ['"SF Pro Text"',    'Inter', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#0071e3',
          hover:   '#0077ed',
          light:   '#e8f1fd',
          muted:   '#b3d1f7',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised:  '#f5f5f7',
          sunken:  '#f0f0f2',
          overlay: '#fbfbfd',
        },
        ink: {
          primary:     '#1d1d1f',
          secondary:   '#6e6e73',
          tertiary:    '#86868b',
          quaternary:  '#aeaeb2',
          placeholder: '#c7c7cc',
        },
        separator: {
          DEFAULT: 'rgba(0,0,0,0.08)',
          opaque:  '#d2d2d7',
        },
      },
      borderRadius: {
        'apple-sm':  '8px',
        'apple':     '12px',
        'apple-lg':  '16px',
        'apple-xl':  '20px',
        'apple-2xl': '24px',
      },
      boxShadow: {
        'apple-xs':    '0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)',
        'apple-sm':    '0 2px 8px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.05)',
        'apple':       '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
        'apple-md':    '0 8px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
        'apple-lg':    '0 16px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        'apple-sheet': '0 24px 64px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06)',
      },
      transitionTimingFunction: {
        'apple':        'cubic-bezier(0.4, 0, 0.2, 1)',
        'apple-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'apple-decel':  'cubic-bezier(0, 0, 0.2, 1)',
        'apple-accel':  'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

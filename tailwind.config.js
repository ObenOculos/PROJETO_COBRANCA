/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class", // Ativa dark mode por classe CSS
  theme: {
    extend: {
      /* ===== TIPOGRAFIA ===== */
      fontSize: {
        xs: ["var(--font-size-xs)", { lineHeight: "var(--line-height-tight)" }],
        sm: [
          "var(--font-size-sm)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        md: [
          "var(--font-size-md)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        lg: [
          "var(--font-size-lg)",
          { lineHeight: "var(--line-height-normal)" },
        ],
        xl: [
          "var(--font-size-xl)",
          { lineHeight: "var(--line-height-relaxed)" },
        ],
        "2xl": [
          "var(--font-size-2xl)",
          { lineHeight: "var(--line-height-relaxed)" },
        ],
        "3xl": [
          "var(--font-size-3xl)",
          { lineHeight: "var(--line-height-relaxed)" },
        ],
      },
      fontWeight: {
        normal: "var(--font-weight-normal)",
        medium: "var(--font-weight-medium)",
        semibold: "var(--font-weight-semibold)",
        bold: "var(--font-weight-bold)",
      },

      /* ===== CORES ===== */
      colors: {
        primary: "var(--color-primary)",
        "primary-light": "var(--color-primary-light)",
        "primary-dark": "var(--color-primary-dark)",
        secondary: "var(--color-secondary)",
        "secondary-light": "var(--color-secondary-light)",
        "secondary-dark": "var(--color-secondary-dark)",
        success: "var(--color-success)",
        "success-light": "var(--color-success-light)",
        "success-bg": "var(--color-success-bg)",
        warning: "var(--color-warning)",
        "warning-light": "var(--color-warning-light)",
        "warning-bg": "var(--color-warning-bg)",
        danger: "var(--color-danger)",
        "danger-light": "var(--color-danger-light)",
        "danger-bg": "var(--color-danger-bg)",
        info: "var(--color-info)",
        "info-light": "var(--color-info-light)",
        "info-bg": "var(--color-info-bg)",
        gray: {
          50: "var(--color-gray-50)",
          100: "var(--color-gray-100)",
          200: "var(--color-gray-200)",
          300: "var(--color-gray-300)",
          400: "var(--color-gray-400)",
          500: "var(--color-gray-500)",
          600: "var(--color-gray-600)",
          700: "var(--color-gray-700)",
          800: "var(--color-gray-800)",
          900: "var(--color-gray-900)",
        },
        dark: {
          bg: "var(--dark-bg)",
          "bg-secondary": "var(--dark-bg-secondary)",
          "bg-tertiary": "var(--dark-bg-tertiary)",
          text: "var(--dark-text)",
          "text-secondary": "var(--dark-text-secondary)",
          border: "var(--dark-border)",
        },
      },

      /* ===== ESPAÇAMENTO ===== */
      spacing: {
        xs: "var(--spacing-xs)",
        sm: "var(--spacing-sm)",
        md: "var(--spacing-md)",
        lg: "var(--spacing-lg)",
        xl: "var(--spacing-xl)",
        "2xl": "var(--spacing-2xl)",
        "3xl": "var(--spacing-3xl)",
      },

      /* ===== SOMBRAS ===== */
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },

      /* ===== BORDER RADIUS ===== */
      borderRadius: {
        sm: "var(--border-radius-sm)",
        md: "var(--border-radius-md)",
        lg: "var(--border-radius-lg)",
        xl: "var(--border-radius-xl)",
      },

      /* ===== Z-INDEX ===== */
      zIndex: {
        dropdown: "var(--z-dropdown)",
        sticky: "var(--z-sticky)",
        fixed: "var(--z-fixed)",
        "modal-backdrop": "var(--z-modal-backdrop)",
        modal: "var(--z-modal)",
        popover: "var(--z-popover)",
        tooltip: "var(--z-tooltip)",
      },

      /* ===== TRANSIÇÕES ===== */
      transitionDuration: {
        fast: "var(--transition-fast)",
        normal: "var(--transition-normal)",
        slow: "var(--transition-slow)",
      },

      /* ===== BREAKPOINTS ===== */
      screens: {
        sm: "640px", // var(--breakpoint-sm)
        md: "768px", // var(--breakpoint-md)
        lg: "1024px", // var(--breakpoint-lg)
        xl: "1280px", // var(--breakpoint-xl)
        "2xl": "1536px", // var(--breakpoint-2xl)
      },

      /* ===== OPACIDADE ===== */
      opacity: {
        0: "0",
        5: "0.05",
        10: "0.1",
        20: "0.2",
        30: "0.3",
        40: "0.4",
        50: "0.5",
        60: "0.6",
        70: "0.7",
        80: "0.8",
        90: "0.9",
        100: "1",
      },
    },
  },
  plugins: [],
};

/**
 * Theme Settings for Rasd Cyber
 * Manages dark/light theme switching and color customization
 */

const THEMES = Object.freeze({
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto'
});

const COLORS = Object.freeze({
  dark: {
    "bg-primary": "#071d1c",
    "bg-secondary": "#0b2a28",
    "bg-tertiary": "#10383a",
    "text-primary": "#ece8da",
    "text-secondary": "#9db3af",
    "text-light": "#9db3af",
    "text-muted": "#6f8783",
    "accent-primary": "#f3a05e",
    "accent-secondary": "#f3a05e",
    "accent-tertiary": "#f3a05e",
    "accent-danger": "#e06c5b",
    "accent-success": "#7ed9a6",
    "accent-warning": "#f3a05e",
    "border-color": "rgba(236, 232, 218, .10)",
    "border-light": "rgba(236, 232, 218, .18)",
    "border-primary": "rgba(243, 160, 94, .35)",
    "status-success": "#7ed9a6",
    "status-warning": "#f3a05e",
    "status-error": "#e06c5b",
    "status-info": "#f3a05e"
},

  light: {
    // Background
    'bg-primary': '#ece8da',
    'bg-secondary': '#ece8da',
    'bg-tertiary': '#ece8da',
    
    // Text
    'text-primary': '#071d1c',
    'text-secondary': '#10383a',
    'text-light': '#6f8783',
    'text-muted': '#9db3af',
    
    // Accent
    'accent-primary': '#071d1c',
    'accent-secondary': '#071d1c',
    'accent-tertiary': '#36534f',
    'accent-danger': '#e06c5b',
    'accent-success': '#7ed9a6',
    'accent-warning': '#f3a05e',
    
    // Borders
    'border-color': '#ece8da',
    'border-light': '#ece8da',
    'border-primary': '#071d1c',
    
    // Status
    'status-success': '#7ed9a6',
    'status-warning': '#f3a05e',
    'status-error': '#e06c5b',
    'status-info': '#f3a05e'
  }
});


class ThemeManager {
  constructor() {
    this.loadCustomColors();
    this.currentTheme = this.loadSavedTheme();
    this.applyTheme(this.currentTheme);
    this.setupListeners();
  }

  /**
   * Load custom colors from localStorage
   */
  loadCustomColors() {
    try {
      const savedDark = localStorage.getItem('cybermind-custom-colors-dark');
      if (savedDark) {
        const parsed = JSON.parse(savedDark);
        Object.assign(COLORS.dark, parsed);
      }
      const savedLight = localStorage.getItem('cybermind-custom-colors-light');
      if (savedLight) {
        const parsed = JSON.parse(savedLight);
        Object.assign(COLORS.light, parsed);
      }
    } catch (e) {
      console.error('Error loading custom colors:', e);
    }
  }

  /**
   * Save custom colors to localStorage
   */
  saveCustomColors(theme) {
    try {
      localStorage.setItem(`cybermind-custom-colors-${theme}`, JSON.stringify(COLORS[theme]));
    } catch (e) {
      console.error('Error saving custom colors:', e);
    }
  }

  /**
   * Load saved theme from localStorage
   */
  loadSavedTheme() {
    const saved = localStorage.getItem('cybermind-theme');
    if (saved && (saved === 'dark' || saved === 'light')) {
      return saved;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'dark'; // Default to dark
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    if (!COLORS[theme]) return;

    const root = document.documentElement;
    const colors = COLORS[theme];

    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    this.currentTheme = theme;
    localStorage.setItem('cybermind-theme', theme);
    this.notifyThemeChange(theme);
  }

  /**
   * Toggle between dark and light
   */
  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
  }

  /**
   * Get current theme
   */
  getCurrent() {
    return this.currentTheme;
  }

  /**
   * Get color for current theme
   */
  getColor(colorKey) {
    return COLORS[this.currentTheme][colorKey];
  }

  /**
   * Set custom colors for a theme
   */
  setCustomColor(theme, colorKey, value) {
    if (!COLORS[theme]) return;
    if (!value.match(/^#[0-9A-Fa-f]{6}$/)) {
      console.error('Invalid color format. Use #RRGGBB');
      return;
    }

    COLORS[theme][colorKey] = value;
    this.saveCustomColors(theme);

    if (theme === this.currentTheme) {
      this.applyTheme(theme);
    }
  }

  /**
   * Get all colors for current theme
   */
  getAllColors() {
    return COLORS[this.currentTheme];
  }

  /**
   * Setup system preference listener
   */
  setupListeners() {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('cybermind-theme') === null) {
          this.applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  /**
   * Notify components about theme change
   */
  notifyThemeChange(theme) {
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  }

  /**
   * Export all colors as CSS
   */
  exportAsCSS() {
    const colors = COLORS[this.currentTheme];
    let css = ':root {\n';

    Object.entries(colors).forEach(([key, value]) => {
      css += `  --${key}: ${value};\n`;
    });

    css += '}\n';
    return css;
  }
}

// Initialize theme manager immediately so that theme styles apply before DOM rendering, avoiding any flash of light or unstyled layout.
window.themeManager = new ThemeManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, THEMES, COLORS };
}

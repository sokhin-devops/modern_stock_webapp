import { definePreset } from '@primeng/themes';
import Material from '@primeng/themes/material';

/**
 * PrimeNG colors that come straight from the prototype's CSS variables (src/styles/_prototype.scss). Those variables
 * already switch for dark mode (.app-dark) and for the business color ([data-palette]), so PrimeNG follows both
 * without a second copy of the colors. The same map serves the light and the dark scheme.
 */
const prototypeColors = {
  primary: {
    color: 'var(--primary)',
    contrastColor: 'var(--on-primary)',
    hoverColor: 'var(--primary-hover)',
    activeColor: 'var(--primary-hover)',
  },
  highlight: {
    background: 'var(--primary-soft)',
    focusBackground: 'var(--primary-container)',
    color: 'var(--on-primary-container)',
    focusColor: 'var(--on-primary-container)',
  },
  formField: {
    background: 'var(--surface)',
    disabledBackground: 'var(--surface-3)',
    borderColor: 'var(--border-strong)',
    hoverBorderColor: 'var(--muted)',
    focusBorderColor: 'var(--primary)',
    invalidBorderColor: 'var(--danger)',
    color: 'var(--text)',
    disabledColor: 'var(--muted)',
    placeholderColor: 'var(--muted)',
    invalidPlaceholderColor: 'var(--danger)',
    floatLabelColor: 'var(--muted)',
    floatLabelFocusColor: 'var(--primary)',
    floatLabelActiveColor: 'var(--muted)',
    floatLabelInvalidColor: 'var(--danger)',
    iconColor: 'var(--muted)',
  },
  text: {
    color: 'var(--text)',
    hoverColor: 'var(--text)',
    mutedColor: 'var(--muted)',
    hoverMutedColor: 'var(--text-2)',
  },
  content: {
    background: 'var(--surface)',
    hoverBackground: 'var(--surface-3)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
    hoverColor: 'var(--text)',
  },
  overlay: {
    select: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' },
    popover: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' },
    modal: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' },
  },
  list: {
    option: {
      focusBackground: 'var(--surface-3)',
      color: 'var(--text)',
      focusColor: 'var(--text)',
      icon: { color: 'var(--muted)', focusColor: 'var(--text-2)' },
    },
    optionGroup: { background: 'transparent', color: 'var(--muted)' },
  },
  navigation: {
    item: {
      focusBackground: 'var(--surface-3)',
      activeBackground: 'var(--primary-soft)',
      color: 'var(--text)',
      focusColor: 'var(--text)',
      activeColor: 'var(--on-primary-container)',
      icon: { color: 'var(--text-2)', focusColor: 'var(--text)', activeColor: 'var(--on-primary-container)' },
    },
    submenuLabel: { background: 'transparent', color: 'var(--muted)' },
  },
};

/** Text-only buttons (the prototype's .btn-text and round icon buttons): primary blue, or grey for icons. */
const flatButtons = {
  primary: { hoverBackground: 'var(--primary-soft)', activeBackground: 'var(--primary-container)', color: 'var(--primary)' },
  secondary: { hoverBackground: 'var(--surface-3)', activeBackground: 'var(--border)', color: 'var(--text-2)' },
};

/** Outlined buttons (the prototype's .btn-outline). */
const outlinedButtons = {
  primary: {
    hoverBackground: 'var(--primary-soft)',
    activeBackground: 'var(--primary-container)',
    borderColor: 'var(--border-strong)',
    color: 'var(--primary)',
  },
  secondary: {
    hoverBackground: 'var(--surface-3)',
    activeBackground: 'var(--border)',
    borderColor: 'var(--border-strong)',
    color: 'var(--text)',
  },
};

/**
 * ModernStock theme: PrimeNG's Material preset (https://v19.primeng.org/theming) with the prototype's colors and
 * shapes: Google blue #1A73E8, grey borders, 10 px fields, 12 px menus, 24 px dialogs, pill buttons.
 */
export const ModernStockPreset = definePreset(Material, {
  semantic: {
    // Google blue; 500 is the brand blue. Only components that ask for a step of the scale use these.
    primary: {
      50: '#e8f0fe',
      100: '#d2e3fc',
      200: '#aecbfa',
      300: '#8ab4f8',
      400: '#669df6',
      500: '#1a73e8',
      600: '#1967d2',
      700: '#185abc',
      800: '#174ea6',
      900: '#0d47a1',
      950: '#041e49',
    },
    formField: {
      borderRadius: '10px',
    },
    content: {
      borderRadius: '12px',
    },
    overlay: {
      select: { borderRadius: '12px', shadow: '0 8px 24px rgba(16, 24, 40, .10), 0 2px 6px rgba(16, 24, 40, .05)' },
      popover: { borderRadius: '12px', shadow: '0 8px 24px rgba(16, 24, 40, .10), 0 2px 6px rgba(16, 24, 40, .05)' },
      modal: { borderRadius: '24px', padding: '24px', shadow: '0 24px 56px rgba(16, 24, 40, .20)' },
      navigation: { shadow: '0 8px 24px rgba(16, 24, 40, .10), 0 2px 6px rgba(16, 24, 40, .05)' },
    },
    navigation: {
      submenuLabel: { padding: '10px 16px 4px', fontWeight: '500' },
    },
    colorScheme: {
      light: {
        // Neutral greys of the prototype (border #e5e7eb, strong border #d1d5db, page #f3f4f6).
        surface: {
          0: '#ffffff',
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7075',
          600: '#444746',
          700: '#374151',
          800: '#1f2937',
          900: '#1f1f1f',
          950: '#111214',
        },
        ...prototypeColors,
      },
      dark: {
        // Google's neutral greys, from white (0) to the prototype's page (950): dark components take text from the
        // light end and backgrounds from the dark end (surface #202124 = 900).
        surface: {
          0: '#ffffff',
          50: '#f8f9fa',
          100: '#f1f3f4',
          200: '#e8eaed',
          300: '#dadce0',
          400: '#bdc1c6',
          500: '#9aa0a6',
          600: '#80868b',
          700: '#5f6368',
          800: '#3c4043',
          900: '#202124',
          950: '#18191b',
        },
        ...prototypeColors,
      },
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '999px',
        roundedBorderRadius: '999px',
        paddingX: '20px',
        paddingY: '10px',
        iconOnlyWidth: '40px',
        label: { fontWeight: '500' },
      },
      colorScheme: {
        light: { text: flatButtons, outlined: outlinedButtons },
        dark: { text: flatButtons, outlined: outlinedButtons },
      },
    },
    progressbar: {
      root: { background: 'var(--surface-3)', borderRadius: '999px', height: '6px' },
    },
    tooltip: {
      root: { background: '#303134', color: '#f1f3f4', borderRadius: '8px', padding: '6px 10px' },
    },
    dialog: {
      title: { fontSize: '22px', fontWeight: '400' },
    },
    floatlabel: {
      root: { fontWeight: '400' },
    },
  },
});

'use client';

type ThemeToggleProps = {
  theme: 'light' | 'dark';
  onToggle: () => void;
};

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';

  return (
    <button
      className="theme-switch"
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Dark mode ${isDark ? 'on' : 'off'}`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      onClick={onToggle}
    >
      <span className="theme-switch-knob" />
    </button>
  );
}
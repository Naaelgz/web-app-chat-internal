export type AccountUser = {
  id: string;
  name: string;
  email: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  isRead: boolean;
};

export type ChatSummary = {
  id: string;
  participants: string[];
  updatedAt: string;
  lastMessage: ChatMessage | null;
  contact: AccountUser;
  unreadCount: number;
  online: boolean;
};

export type ChatThread = Omit<ChatSummary, 'lastMessage'> & {
  messages: ChatMessage[];
};

const THEME_KEY = 'akselera-theme';

export function getTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function subscribeTheme(listener: () => void) {
  window.addEventListener('akselera-theme-change', listener);
  return () => window.removeEventListener('akselera-theme-change', listener);
}

export function getThemeSnapshot(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function getServerThemeSnapshot(): 'light' | 'dark' {
  return 'light';
}

export function setTheme(nextTheme: 'light' | 'dark') {
  localStorage.setItem(THEME_KEY, nextTheme);
  document.documentElement.dataset.theme = nextTheme;
  window.dispatchEvent(new Event('akselera-theme-change'));
}
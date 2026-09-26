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

export type ChatThread = {
  id: string;
  participants: string[];
  updatedAt: string;
  messages: ChatMessage[];
  contact: AccountUser;
  unreadCount: number;
  online: boolean;
};

const THEME_KEY = 'akselera-theme';

export function getTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function setTheme(nextTheme: 'light' | 'dark') {
  localStorage.setItem(THEME_KEY, nextTheme);
}
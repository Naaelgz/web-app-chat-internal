'use client';

import Image from 'next/image';
import * as Ably from 'ably';
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/theme-toggle';
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type AccountUser,
  type ChatSummary,
  type ChatThread,
} from '../../lib/chat-data';

const darkLogo = '/logo/akselera-dark-cropped.png';
const whiteLogo = '/logo/akselera-white-cropped.png';
const FALLBACK_POLL_INTERVAL = 60_000;
const PRESENCE_HEARTBEAT_INTERVAL = 30_000;
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
});
const weekdayFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long' });
const fullDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function localDateKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getDateLabel(value: string | Date, includeToday = false) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (localDateKey(date) === localDateKey(today)) {
    return includeToday ? 'Hari ini' : dateTimeFormatter.format(date);
  }
  if (localDateKey(date) === localDateKey(yesterday)) return 'Kemarin';

  const ageInDays = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  );
  return ageInDays < 7 ? weekdayFormatter.format(date) : fullDateFormatter.format(date);
}

async function loadChats(): Promise<ChatSummary[] | null> {
  const response = await fetch('/api/chats', { cache: 'no-store' });
  if (!response.ok) return null;
  const result = (await response.json()) as { chats: ChatSummary[] };
  return result.chats;
}

async function loadChat(chatId: string, markRead = false): Promise<ChatThread | null> {
  const query = markRead ? '?markRead=true' : '';
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}${query}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const result = (await response.json()) as { chat: ChatThread };
  return result.chat;
}

export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<AccountUser | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatThread | null>(null);
  const [contacts, setContacts] = useState<AccountUser[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [activeChatId, setActiveChatId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  const activeChatIdRef = useRef(activeChatId);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) {
          router.replace('/login');
          return;
        }

        const result = (await response.json()) as { user: AccountUser };
        if (cancelled) return;

        setSession(result.user);

        const initialChats = await loadChats();
        if (!initialChats || cancelled) return;
        setChats(initialChats);
        setActiveChatId(initialChats[0]?.id ?? '');
      } catch {
        router.replace('/login');
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const refreshChats = async () => {
      try {
        const nextChats = await loadChats();
        if (nextChats && !cancelled) setChats(nextChats);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    void refreshChats();
    if (realtimeConnected) {
      return () => {
        cancelled = true;
      };
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshChats();
    };
    const interval = window.setInterval(refreshWhenVisible, FALLBACK_POLL_INTERVAL);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [realtimeConnected, router, session]);

  useEffect(() => {
    if (!session || !activeChatId) {
      return;
    }

    let cancelled = false;
    let firstRequest = true;
    const refreshActiveChat = async () => {
      try {
        const nextChat = await loadChat(activeChatId, firstRequest);
        firstRequest = false;
        if (nextChat && !cancelled && activeChatIdRef.current === activeChatId) {
          setActiveChat(nextChat);
          setChats((currentChats) =>
            currentChats.map((chat) =>
              chat.id === activeChatId ? { ...chat, unreadCount: 0 } : chat,
            ),
          );
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    void refreshActiveChat();
    if (realtimeConnected) {
      return () => {
        cancelled = true;
      };
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshActiveChat();
    };
    const interval = window.setInterval(refreshWhenVisible, FALLBACK_POLL_INTERVAL);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [activeChatId, realtimeConnected, router, session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let closeRealtime: (() => void) | undefined;

    const connectRealtime = async () => {
      try {
        const statusResponse = await fetch('/api/realtime/status', { cache: 'no-store' });
        if (!statusResponse.ok) return;
        const status = (await statusResponse.json()) as { enabled: boolean };
        if (!status.enabled || cancelled) return;

        const realtime = new Ably.Realtime({
          authUrl: '/api/realtime/token',
          authMethod: 'GET',
          echoMessages: false,
        });
        const channel = realtime.channels.get(`user:${session.id}`);
        const refreshOnEvent = async (event: Ably.Message) => {
          const currentChatId = activeChatIdRef.current;
          const incomingChatId = (event.data as { chatId?: string } | undefined)?.chatId;
          const currentChatNeedsRead = Boolean(currentChatId && incomingChatId === currentChatId);

          if (currentChatId && currentChatNeedsRead) {
            const nextChat = await loadChat(currentChatId, true);
            if (nextChat && activeChatIdRef.current === currentChatId) setActiveChat(nextChat);
          } else if (currentChatId) {
            const nextChat = await loadChat(currentChatId);
            if (nextChat && activeChatIdRef.current === currentChatId) setActiveChat(nextChat);
          }

          const nextChats = await loadChats();
          if (nextChats) setChats(nextChats);
        };

        channel.subscribe('chat.updated', refreshOnEvent);
        realtime.connection.on((stateChange) => {
          setRealtimeConnected(stateChange.current === 'connected');
        });

        closeRealtime = () => {
          channel.unsubscribe('chat.updated', refreshOnEvent);
          realtime.close();
          setRealtimeConnected(false);
        };
      } catch {
        setRealtimeConnected(false);
      }
    };

    void connectRealtime();
    return () => {
      cancelled = true;
      closeRealtime?.();
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const sendPresence = async (online: boolean) => {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online }),
      });
    };
    const updatePresence = () => {
      if (document.visibilityState === 'visible') void sendPresence(navigator.onLine);
    };

    updatePresence();
    const interval = window.setInterval(updatePresence, PRESENCE_HEARTBEAT_INTERVAL);
    window.addEventListener('online', updatePresence);
    window.addEventListener('offline', updatePresence);
    document.addEventListener('visibilitychange', updatePresence);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', updatePresence);
      window.removeEventListener('offline', updatePresence);
      document.removeEventListener('visibilitychange', updatePresence);
      void sendPresence(false);
    };
  }, [session]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return chats;
    return chats.filter((chat) =>
      [chat.contact.name, chat.lastMessage?.text ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [chats, searchQuery]);

  const filteredContacts = useMemo(() => {
    const query = contactSearchQuery.trim().toLocaleLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      `${contact.name} ${contact.email}`.toLocaleLowerCase().includes(query),
    );
  }, [contactSearchQuery, contacts]);

  const handleSelectChat = (chatId: string) => {
    setActiveChat(null);
    setActiveChatId(chatId);
    setChats((currentChats) =>
      currentChats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)),
    );
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!activeChat || !text) return;

    const response = await fetch(`/api/chats/${encodeURIComponent(activeChat.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return;

    setMessageText('');
    const [nextChats, nextChat] = await Promise.all([loadChats(), loadChat(activeChat.id)]);
    if (nextChats) setChats(nextChats);
    if (nextChat) setActiveChat(nextChat);
  };

  const openContactPicker = async () => {
    if (!isContactPickerOpen) {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (response.ok) {
        const result = (await response.json()) as { users: AccountUser[] };
        setContacts(result.users);
      }
    }
      if (isContactPickerOpen) setContactSearchQuery('');
    setIsContactPickerOpen((isOpen) => !isOpen);
  };

  const handleNewChat = async (contactId: string) => {
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: contactId }),
    });
    if (!response.ok) return;

    const result = (await response.json()) as { chat: ChatSummary };
    if (!result.chat) return;
    setActiveChat(null);
    setActiveChatId(result.chat.id);
    setSearchQuery('');
    setIsContactPickerOpen(false);
    const nextChats = await loadChats();
    if (nextChats) setChats(nextChats);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };

  if (!session) return null;

  return (
    <main className="page-shell app-shell">
      <header className="app-topbar">
        <Image
          src={theme === 'light' ? darkLogo : whiteLogo}
          alt="Akselera Tech logo"
          className="brand-logo header-logo"
          width={190}
          height={52}
          priority
        />
        <div className="header-actions">
          <div className="header-user">
            <span className="header-user-name">{session.name}</span>
            <span className="header-user-avatar" aria-hidden="true">
              {session.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </span>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <aside className="sidebar-panel">
        <div className="profile-box">
          <div className="avatar large">{session.name.charAt(0)}</div>
          <div>
            <strong>{session.name}</strong>
            <p>{session.email}</p>
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="ghost-button" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="chat-list-toolbar">
          <input
            className="chat-search-input"
            type="search"
            aria-label="Cari chat"
            placeholder="Cari chat"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            className="new-chat-button"
            type="button"
            aria-expanded={isContactPickerOpen}
            onClick={openContactPicker}
          >
            + Chat baru
          </button>
          {isContactPickerOpen ? (
            <div className="chat-contact-menu" aria-label="Pilih kontak untuk chat baru">
              <input
                className="contact-search-input"
                type="search"
                aria-label="Cari kontak"
                placeholder="Cari nama atau email"
                value={contactSearchQuery}
                onChange={(event) => setContactSearchQuery(event.target.value)}
              />
              <div className="chat-contact-options">
                {filteredContacts.map((contact) => (
                  <button key={contact.id} type="button" onClick={() => void handleNewChat(contact.id)}>
                    <span className="avatar">{contact.name.charAt(0)}</span>
                    <span className="chat-contact-copy">
                      <strong>{contact.name}</strong>
                      <small>{contact.email}</small>
                    </span>
                  </button>
                ))}
                {filteredContacts.length === 0 ? (
                  <p className="chat-list-empty">Kontak tidak ditemukan</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="chat-list">
          {filteredChats.map((chat) => {
            const lastMessage = chat.lastMessage;
            return (
              <button
                type="button"
                key={chat.id}
                className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="avatar">{chat.contact.name.charAt(0)}</div>
                <div className="chat-item-copy">
                  <div className="chat-item-header">
                    <strong>{chat.contact.name}</strong>
                    <div className="chat-item-meta">
                      {lastMessage ? (
                        <time className="chat-item-time" dateTime={lastMessage.createdAt}>
                          {getDateLabel(lastMessage.createdAt)}
                        </time>
                      ) : null}
                      {chat.unreadCount > 0 ? (
                        <span className="unread-badge" aria-label={`${chat.unreadCount} unread messages`}>
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p>{lastMessage?.text ?? 'Mulai percakapan'}</p>
                </div>
              </button>
            );
          })}
          {filteredChats.length === 0 ? (
            <p className="chat-list-empty">
              {searchQuery.trim() ? 'Chat tidak ditemukan' : 'Belum ada percakapan'}
            </p>
          ) : null}
        </div>
      </aside>

      <section className="chat-panel">
        {activeChat && activeChat.id === activeChatId ? (
          <>
            <header className="chat-header">
              <div className="chat-person">
                <div className="avatar large">{activeChat.contact.name.charAt(0)}</div>
                <div>
                  <strong>{activeChat.contact.name}</strong>
                  <p className="presence-status" data-online={activeChat.online}>
                    {activeChat.online ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            </header>

            <div className="messages-panel">
              {activeChat.messages.map((message, index) => {
                const isMe = message.senderId === session.id;
                const isFirstMessageOfDay =
                  index === 0 ||
                  localDateKey(activeChat.messages[index - 1].createdAt) !==
                    localDateKey(message.createdAt);
                return (
                  <div key={message.id} className="message-day-group">
                    {isFirstMessageOfDay ? (
                      <div className="message-day-divider">
                        <span>{getDateLabel(message.createdAt, true)}</span>
                      </div>
                    ) : null}
                    <div className={`message-bubble ${isMe ? 'mine' : 'theirs'}`}>
                      <span>{message.text}</span>
                      <small>{dateTimeFormatter.format(new Date(message.createdAt))}</small>
                    </div>
                  </div>
                );
              })}
            </div>

            <form className="message-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Ketik pesan..."
              />
              <button className="primary-button" type="submit">
                Kirim
              </button>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <h2>{activeChatId ? 'Memuat percakapan...' : 'Belum ada chat aktif'}</h2>
            {!activeChatId ? <p>Mulai percakapan baru untuk menulis ke tim.</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}
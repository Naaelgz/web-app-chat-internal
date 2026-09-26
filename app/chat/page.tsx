'use client';

import Image from 'next/image';
import * as Ably from 'ably';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '../../components/theme-toggle';
import { getTheme, setTheme, type AccountUser, type ChatThread } from '../../lib/chat-data';

const darkLogo = '/logo/Akselera Tech dark logo.png';
const whiteLogo = '/logo/Akselera Tech white logo.png';

async function loadChats(activeChatId?: string): Promise<ChatThread[] | null> {
  const query = activeChatId ? `?active=${encodeURIComponent(activeChatId)}` : '';
  const response = await fetch(`/api/chats${query}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const result = (await response.json()) as { chats: ChatThread[] };
  return result.chats;
}

export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<AccountUser | null>(null);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [contacts, setContacts] = useState<AccountUser[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

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

        const legacyHistory = localStorage.getItem('akselera-chat-data');
        if (legacyHistory) {
          try {
            const legacyChats = JSON.parse(legacyHistory) as unknown;
            await fetch('/api/migration/browser-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chats: legacyChats }),
            });
          } catch {
            // Leave the legacy browser backup untouched if migration is unavailable.
          }
        }

        const initialChats = await loadChats();
        if (!initialChats || cancelled) return;
        setChats(initialChats);
        setActiveChatId(initialChats[0]?.id ?? '');

        const currentTheme = getTheme();
        setThemeState(currentTheme);
        document.documentElement.dataset.theme = currentTheme;
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
        const nextChats = await loadChats(activeChatId || undefined);
        if (nextChats && !cancelled) setChats(nextChats);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    void refreshChats();
    const interval = window.setInterval(refreshChats, realtimeConnected ? 30_000 : 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
        const refreshOnEvent = () => {
          void loadChats(activeChatIdRef.current || undefined).then((nextChats) => {
            if (nextChats) setChats(nextChats);
          });
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
    const updatePresence = () => void sendPresence(navigator.onLine);

    updatePresence();
    const interval = window.setInterval(updatePresence, 5_000);
    window.addEventListener('online', updatePresence);
    window.addEventListener('offline', updatePresence);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', updatePresence);
      window.removeEventListener('offline', updatePresence);
      void sendPresence(false);
    };
  }, [session]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(nextTheme);
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return chats;
    return chats.filter((chat) =>
      [chat.contact.name, ...chat.messages.map((message) => message.text)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [chats, searchQuery]);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0] ?? null;

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
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
    const nextChats = await loadChats(activeChat.id);
    if (nextChats) setChats(nextChats);
  };

  const openContactPicker = async () => {
    if (!isContactPickerOpen) {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (response.ok) {
        const result = (await response.json()) as { users: AccountUser[] };
        setContacts(result.users);
      }
    }
    setIsContactPickerOpen((isOpen) => !isOpen);
  };

  const handleNewChat = async (contactId: string) => {
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: contactId }),
    });
    if (!response.ok) return;

    const result = (await response.json()) as { chat: ChatThread };
    setActiveChatId(result.chat.id);
    setSearchQuery('');
    setIsContactPickerOpen(false);
    const nextChats = await loadChats(result.chat.id);
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
          width={150}
          height={32}
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
              {contacts.map((contact) => (
                <button key={contact.id} type="button" onClick={() => void handleNewChat(contact.id)}>
                  <span className="avatar">{contact.name.charAt(0)}</span>
                  <span>{contact.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="chat-list">
          {filteredChats.map((chat) => {
            const lastMessage = chat.messages[chat.messages.length - 1];
            return (
              <button
                type="button"
                key={chat.id}
                className={`chat-item ${chat.id === activeChat?.id ? 'active' : ''}`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="avatar">{chat.contact.name.charAt(0)}</div>
                <div className="chat-item-copy">
                  <div className="chat-item-header">
                    <strong>{chat.contact.name}</strong>
                    <div className="chat-item-meta">
                      {lastMessage ? (
                        <time className="chat-item-time" dateTime={lastMessage.createdAt}>
                          {new Date(lastMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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
        {activeChat ? (
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
              {activeChat.messages.map((message) => {
                const isMe = message.senderId === session.id;
                return (
                  <div key={message.id} className={`message-bubble ${isMe ? 'mine' : 'theirs'}`}>
                    <span>{message.text}</span>
                    <small>
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
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
            <h2>Belum ada chat aktif</h2>
            <p>Mulai percakapan baru untuk menulis ke tim.</p>
          </div>
        )}
      </section>
    </main>
  );
}
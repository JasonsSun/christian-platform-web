'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Ntf = {
  kind?: 'sync';
  unread?: number;
  type?: string;
  title?: string;
  body?: string;
  link?: string;
  createdAt?: string;
};

interface Ctx {
  /** 当前未读通知数(实时校准) */
  unread: number;
  /** 最近一条新通知(用于桌面弹窗提示,6s 后自动消失) */
  latest: Ntf | null;
  /** 主动从服务端重新拉一次未读数(通知页「全部已读」后调用) */
  refreshUnread: () => void;
  /** 关闭当前弹窗 */
  dismissLatest: () => void;
}

const NotificationContext = createContext<Ctx>({
  unread: 0,
  latest: null,
  refreshUnread: () => {},
  dismissLatest: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<Ntf | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnread(0);
      return;
    }
    try {
      const r = await api<{ unread: number }>(`/notifications?pageSize=1`);
      setUnread(Number(r.unread) || 0);
    } catch {
      /* 拉取失败不阻断 */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      esRef.current?.close();
      esRef.current = null;
      setUnread(0);
      setLatest(null);
      return;
    }

    // 初始基准未读数
    refreshUnread();

    const token = tokenStore.get();
    const url = token
      ? `/api/v1/notifications/stream?token=${encodeURIComponent(token)}`
      : `/api/v1/notifications/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data) as Ntf;
        if (p.kind === 'sync' && typeof p.unread === 'number') {
          setUnread(p.unread);
        } else if (p.type) {
          setUnread((u) => u + 1);
          setLatest(p);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setLatest(null), 6000);
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      // EventSource 会自动重连,这里不做事
    };

    // 通知页「全部已读 / 单条已读」后派发事件,这里重新校准(避免红点残留)
    const onRead = () => refreshUnread();
    window.addEventListener('notif:read', onRead);

    return () => {
      es.close();
      window.removeEventListener('notif:read', onRead);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [user?.id, refreshUnread]);

  return (
    <NotificationContext.Provider
      value={{ unread, latest, refreshUnread, dismissLatest: () => setLatest(null) }}
    >
      {children}
      {latest && (
        <NotificationToast
          n={latest}
          onClose={() => setLatest(null)}
          onClick={() => {
            const link = latest.link;
            setLatest(null);
            if (link) router.push(link);
          }}
        />
      )}
    </NotificationContext.Provider>
  );
}

function NotificationToast({
  n,
  onClose,
  onClick,
}: {
  n: Ntf;
  onClose: () => void;
  onClick: () => void;
}) {
  return (
    <div className="fixed top-20 right-4 z-[60] max-w-[330px] w-[calc(100%-2rem)]">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left glass rounded-2xl shadow-card-hover p-4 border border-primary-200 flex items-start gap-3 transition-all hover:border-primary-300"
      >
        <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center text-lg flex-shrink-0">
          🔔
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900 text-sm truncate">{n.title}</p>
          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{n.body}</p>
        </div>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-ink-300 hover:text-ink-500 text-xs flex-shrink-0"
        >
          ✕
        </span>
      </button>
    </div>
  );
}

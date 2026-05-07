import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWidgetConversation, createWidgetWebSocket, listWidgetMessages, sendWidgetMessage } from "./api";
import type { WidgetMessage, WidgetRealtimeEvent, WidgetSession } from "./types";

type WidgetConfig = {
  channelId: string;
  title: string;
  primaryColor: string;
  pageUrl?: string;
  pageTitle?: string;
};

type LoadState = "loading" | "ready" | "error";
type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export function WidgetApp() {
  const config = useMemo(readConfig, []);
  const [session, setSession] = useState<WidgetSession | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<WidgetMessage[]>([]);

  const mergeMessages = useCallback((items: WidgetMessage[]) => {
    if (items.length === 0) return;
    setMessages((current) => {
      const next = [...current];
      for (const item of items) {
        const optimisticIndex = next.findIndex((message) => shouldReplaceOptimisticMessage(message, item));
        if (optimisticIndex >= 0) {
          next.splice(optimisticIndex, 1, item);
        } else {
          next.push(item);
        }
      }

      const merged = new Map(next.map((message) => [message.id, message]));
      return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    });
  }, []);

  const replaceMessage = useCallback((messageId: string, items: WidgetMessage[]) => {
    setMessages((current) => {
      const merged = new Map(current.filter((message) => message.id !== messageId).map((message) => [message.id, message]));
      for (const item of items) merged.set(item.id, item);
      return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    });
  }, []);

  const pullMessages = useCallback(
    async (activeSession: WidgetSession, afterMessageId?: string) => {
      const result = await listWidgetMessages({
        conversationId: activeSession.conversationId,
        visitorToken: activeSession.visitorToken,
        afterMessageId,
      });
      mergeMessages(result.messages);
    },
    [mergeMessages]
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!config.channelId) {
        setError("缺少渠道配置");
        setLoadState("error");
        return;
      }

      try {
        const visitorId = getOrCreateVisitorId(config.channelId);
        const nextSession = await createWidgetConversation({
          channelAccountId: config.channelId,
          visitorId,
          pageUrl: config.pageUrl,
          pageTitle: config.pageTitle,
        });
        if (cancelled) return;

        saveSession(config.channelId, nextSession);
        setSession(nextSession);
        setLoadState("ready");
        await pullMessages(nextSession);
      } catch (bootError) {
        if (cancelled) return;
        setError(bootError instanceof Error ? bootError.message : "加载失败");
        setLoadState("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [config, pullMessages]);

  useEffect(() => {
    if (!session) return undefined;

    const activeSession = session;
    let closedByEffect = false;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let socket: WebSocket | null = null;

    function scheduleReconnect() {
      if (closedByEffect) return;
      const delays = [1000, 2000, 5000, 10000, 30000];
      const delay = delays[Math.min(reconnectAttempt, delays.length - 1)];
      reconnectAttempt += 1;
      setConnectionState("reconnecting");
      reconnectTimer = window.setTimeout(connect, delay);
    }

    function connect() {
      if (closedByEffect) return;
      setConnectionState(reconnectAttempt > 0 ? "reconnecting" : "connecting");
      socket = createWidgetWebSocket({
        conversationId: activeSession.conversationId,
        visitorToken: activeSession.visitorToken,
      });

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
        const afterMessageId = getLastRemoteMessageId(messagesRef.current);
        void pullMessages(activeSession, afterMessageId).catch(() => undefined);
      };

      socket.onmessage = (event) => {
        const realtimeEvent = parseWidgetRealtimeEvent(event.data);
        if (realtimeEvent?.type === "message.new" && realtimeEvent.conversationId === activeSession.conversationId) {
          mergeMessages([realtimeEvent.message]);
        }
      };

      socket.onclose = () => {
        socket = null;
        if (!closedByEffect) scheduleReconnect();
      };

      socket.onerror = () => {
        setConnectionState("disconnected");
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [mergeMessages, pullMessages, session]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || isSending) return;

    const content = draft.trim();
    if (!content) return;

    setDraft("");
    setIsSending(true);
    setError("");

    const clientMessageId = `local_${randomId()}`;
    const optimisticMessage: WidgetMessage = {
      id: clientMessageId,
      direction: "inbound",
      senderType: "customer",
      messageType: "text",
      content,
      status: "sending",
      createdAt: new Date().toISOString(),
    };
    mergeMessages([optimisticMessage]);

    try {
      const result = await sendWidgetMessage({
        conversationId: session.conversationId,
        visitorToken: session.visitorToken,
        clientMessageId,
        content,
        pageUrl: config.pageUrl,
        pageTitle: config.pageTitle,
      });
      replaceMessage(optimisticMessage.id, [result.inboundMessage]);
    } catch (sendError) {
      setDraft(content);
      setMessages((current) =>
        current.map((message) => (message.id === optimisticMessage.id ? { ...message, status: "failed" } : message))
      );
      setError(sendError instanceof Error ? sendError.message : "发送失败");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="supportly-frame" style={{ "--supportly-primary": config.primaryColor } as CSSProperties}>
      <header className="supportly-header">
        <div>
          <div className="supportly-title">{config.title}</div>
          <div className="supportly-status">{formatConnectionStatus(loadState, connectionState)}</div>
        </div>
        <button className="supportly-close" type="button" aria-label="关闭" onClick={closeWidget}>
          ×
        </button>
      </header>

      <main ref={listRef} className="supportly-messages">
        {messages.length === 0 ? (
          <div className="supportly-empty">{loadState === "loading" ? "正在连接客服..." : "你好，请输入你的问题。"}</div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </main>

      {error ? <div className="supportly-error">{error}</div> : null}

      <form className="supportly-composer" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="请输入消息"
          disabled={loadState !== "ready" || isSending}
          maxLength={2000}
        />
        <button type="submit" disabled={loadState !== "ready" || isSending || !draft.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: WidgetMessage }) {
  const mine = message.direction === "inbound";
  const label = mine ? "我" : message.senderType === "ai" ? "AI" : "客服";
  return (
    <div className={mine ? "supportly-row supportly-row-mine" : "supportly-row"}>
      <div className="supportly-meta">{label}</div>
      <div className={mine ? "supportly-bubble supportly-bubble-mine" : "supportly-bubble"}>
        {message.content || "[非文本消息]"}
      </div>
      {mine ? <div className={message.status === "failed" ? "supportly-send-status supportly-send-status-failed" : "supportly-send-status"}>{formatSendStatus(message.status)}</div> : null}
    </div>
  );
}

function formatSendStatus(status: WidgetMessage["status"]): string {
  if (status === "sending") return "发送中";
  if (status === "failed") return "发送失败";
  return "已发送";
}

function formatConnectionStatus(loadState: LoadState, connectionState: ConnectionState): string {
  if (loadState === "loading") return "连接中";
  if (loadState === "error") return "不可用";
  if (connectionState === "connected") return "在线";
  if (connectionState === "reconnecting") return "重连中";
  return "连接中";
}

function parseWidgetRealtimeEvent(value: unknown): WidgetRealtimeEvent | null {
  if (typeof value !== "string") return null;
  try {
    const event = JSON.parse(value) as WidgetRealtimeEvent;
    return event && typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
}

function getLastRemoteMessageId(messages: WidgetMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index]?.id;
    if (id && !id.startsWith("local_")) return id;
  }
  return undefined;
}

function shouldReplaceOptimisticMessage(localMessage: WidgetMessage, remoteMessage: WidgetMessage): boolean {
  return (
    localMessage.id.startsWith("local_") &&
    localMessage.status === "sending" &&
    remoteMessage.direction === "inbound" &&
    remoteMessage.senderType === "customer" &&
    localMessage.direction === remoteMessage.direction &&
    localMessage.senderType === remoteMessage.senderType &&
    localMessage.content === remoteMessage.content
  );
}

function readConfig(): WidgetConfig {
  const params = new URLSearchParams(window.location.search);
  return {
    channelId: params.get("channel_id")?.trim() ?? "",
    title: params.get("title")?.trim() || "在线客服",
    primaryColor: params.get("primary_color")?.trim() || "#2563eb",
    pageUrl: params.get("page_url") || undefined,
    pageTitle: params.get("page_title") || undefined,
  };
}

function closeWidget(): void {
  window.parent.postMessage({ type: "supportly:close" }, "*");
}

function getOrCreateVisitorId(channelId: string): string {
  const storedSession = readStoredSession(channelId);
  if (storedSession?.visitorId) return storedSession.visitorId;

  const key = getVisitorKey(channelId);
  const existing = readLocalStorage(key);
  if (existing) return existing;

  const visitorId = `visitor_${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : randomId()}`;
  writeLocalStorage(key, visitorId);
  return visitorId;
}

function saveSession(channelId: string, session: WidgetSession): void {
  writeLocalStorage(getSessionKey(channelId), JSON.stringify(session));
  writeLocalStorage(getVisitorKey(channelId), session.visitorId);
}

function readStoredSession(channelId: string): WidgetSession | null {
  try {
    const value = readLocalStorage(getSessionKey(channelId));
    return value ? (JSON.parse(value) as WidgetSession) : null;
  } catch {
    return null;
  }
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return undefined;
  }
}

function getVisitorKey(channelId: string): string {
  return `supportly.${channelId}.visitor_id`;
}

function getSessionKey(channelId: string): string {
  return `supportly.${channelId}.session`;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

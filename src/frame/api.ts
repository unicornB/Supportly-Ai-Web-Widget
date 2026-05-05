import type { SendMessageResult, WidgetMessage, WidgetSession } from "./types";

const API_BASE_URL = import.meta.env.VITE_WIDGET_API_BASE_URL ?? "";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export async function createWidgetConversation(input: {
  channelAccountId: string;
  visitorId: string;
  pageUrl?: string;
  pageTitle?: string;
}) {
  return apiRequest<WidgetSession>("/api/widget/conversations", {
    method: "POST",
    json: input,
  });
}

export async function sendWidgetMessage(input: {
  conversationId: string;
  visitorToken: string;
  content: string;
  pageUrl?: string;
  pageTitle?: string;
}) {
  return apiRequest<SendMessageResult>(`/api/widget/conversations/${input.conversationId}/messages`, {
    method: "POST",
    token: input.visitorToken,
    json: {
      content: input.content,
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
    },
  });
}

export async function listWidgetMessages(input: {
  conversationId: string;
  visitorToken: string;
  afterMessageId?: string;
}) {
  const query = input.afterMessageId ? `?after=${encodeURIComponent(input.afterMessageId)}` : "";
  return apiRequest<{ messages: WidgetMessage[] }>(`/api/widget/conversations/${input.conversationId}/messages${query}`, {
    method: "GET",
    token: input.visitorToken,
  });
}

async function apiRequest<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { json?: unknown; token?: string }
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });

  const body = (await response.json().catch(() => null)) as (ApiEnvelope<T> & ApiErrorBody) | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? "请求失败");
  }

  return body?.data as T;
}

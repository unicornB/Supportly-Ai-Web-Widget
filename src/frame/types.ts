export type WidgetSession = {
  conversationId: string;
  channelAccountId: string;
  visitorId: string;
  visitorToken: string;
  expiresAt: string;
};

export type WidgetMessage = {
  id: string;
  direction: "inbound" | "outbound" | "internal" | "system";
  senderType: "customer" | "agent" | "ai" | "system";
  messageType: "text" | "image" | "file" | "audio" | "event";
  content: string | null;
  status: "received" | "sending" | "sent" | "failed";
  createdAt: string;
};

export type SendMessageResult = {
  conversationId: string;
  inboundMessage: WidgetMessage;
  aiMessage: WidgetMessage | null;
  duplicate: boolean;
};

import supportlyIconUrl from "../images/supportly.png";

(function initSupportlyWidget() {
  const script = getCurrentScript();
  if (!script) return;

  const channelId = script.dataset.channelId?.trim();
  if (!channelId) return;

  const title = script.dataset.title?.trim() || "在线客服";
  const position = script.dataset.position === "left" ? "left" : "right";
  const primaryColor = script.dataset.primaryColor?.trim() || "#2563eb";
  const baseUrl = new URL(script.src).origin;
  const widgetId = `supportly-widget-${channelId}`;

  if (document.getElementById(widgetId)) return;

  const button = document.createElement("button");
  const iframe = document.createElement("iframe");
  let opened = false;

  button.id = widgetId;
  button.type = "button";
  button.setAttribute("aria-label", title);
  applyButtonStyle(button, position, primaryColor);
  button.appendChild(createButtonIcon(title));

  iframe.title = title;
  iframe.src = buildFrameUrl(baseUrl, { channelId, title, primaryColor });
  applyFrameStyle(iframe, position);

  button.addEventListener("click", () => {
    opened = !opened;
    iframe.style.display = opened ? "block" : "none";
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== baseUrl || !event.data || typeof event.data !== "object") return;
    if ((event.data as { type?: string }).type === "supportly:close") {
      opened = false;
      iframe.style.display = "none";
    }
  });

  window.addEventListener("resize", () => applyFrameStyle(iframe, position));
  window.visualViewport?.addEventListener("resize", () => applyFrameStyle(iframe, position));

  document.body.appendChild(button);
  document.body.appendChild(iframe);
})();

function getCurrentScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript;
  const scripts = Array.from(document.getElementsByTagName("script"));
  const matched = scripts.find((item) => item.src.includes("/widget/supportly.js"));
  return matched instanceof HTMLScriptElement ? matched : null;
}

function buildFrameUrl(
  baseUrl: string,
  input: { channelId: string; title: string; primaryColor: string }
): string {
  const url = new URL("/widget/frame.html", baseUrl);
  url.searchParams.set("channel_id", input.channelId);
  url.searchParams.set("title", input.title);
  url.searchParams.set("primary_color", input.primaryColor);
  url.searchParams.set("page_url", window.location.href);
  url.searchParams.set("page_title", document.title);
  return url.toString();
}

function createButtonIcon(title: string): HTMLImageElement {
  const icon = document.createElement("img");
  icon.src = supportlyIconUrl;
  icon.alt = title;
  icon.draggable = false;
  Object.assign(icon.style, {
    display: "block",
    width: "34px",
    height: "34px",
    objectFit: "contain",
    pointerEvents: "none",
  });
  return icon;
}

function applyButtonStyle(button: HTMLButtonElement, position: "left" | "right", _primaryColor: string): void {
  Object.assign(button.style, {
    position: "fixed",
    bottom: "max(20px, env(safe-area-inset-bottom))",
    [position]: `max(20px, env(safe-area-inset-${position}))`,
    zIndex: "2147483000",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "56px",
    height: "56px",
    padding: "0",
    border: "0",
    borderRadius: "999px",
    background: "#ffffff",
    boxShadow: "0 14px 32px rgba(15, 23, 42, 0.20)",
    cursor: "pointer",
    overflow: "hidden",
  });
}

function applyFrameStyle(iframe: HTMLIFrameElement, position: "left" | "right"): void {
  const isMobile = window.innerWidth <= 640;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  Object.assign(iframe.style, {
    position: "fixed",
    display: iframe.style.display === "block" ? "block" : "none",
    bottom: isMobile ? "0" : "82px",
    [position]: isMobile ? "0" : "20px",
    zIndex: "2147483001",
    width: isMobile ? "100dvw" : "380px",
    height: isMobile ? `${Math.round(viewportHeight)}px` : "620px",
    maxWidth: "100vw",
    maxHeight: "100dvh",
    border: "0",
    borderRadius: isMobile ? "0" : "12px",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.24)",
    background: "#ffffff",
  });
}

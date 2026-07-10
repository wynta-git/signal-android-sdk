"use client";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { getToken } from "../../services/tokenRegistry";
import { selectBridgeUser } from "../../store/slices/usersSlice";

const CHAT_URL =
  process.env.NEXT_PUBLIC_CHAT_URL || "https://qa-chat.fozilpartners.com/chat/";
const CHAT_ORIGIN = new URL(CHAT_URL).origin;

export default function ChatPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState("");
  const [chatReady, setChatReady] = useState(false);
  const bridgeUser = useSelector(selectBridgeUser);

  useEffect(() => {
    const existing = getToken();
    if (existing) {
      setToken(existing);
      return;
    }
    const interval = setInterval(() => {
      const t = getToken();
      if (t) {
        setToken(t);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== CHAT_ORIGIN) return;
      if (event.data?.type === "CHAT_READY") {
        setChatReady(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!token || !chatReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "AUTH_TOKEN", token, userId: bridgeUser?.id },
      CHAT_ORIGIN,
    );
  }, [token, chatReady, bridgeUser]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {!chatReady && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#fff",
          }}
        >
          <style>
            {"@keyframes chat-spin { to { transform: rotate(360deg); } }"}
          </style>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid #e5e7eb",
              borderTopColor: "#6b7280",
              borderRadius: "50%",
              animation: "chat-spin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: 13, color: "#6b7280" }}>Loading chat…</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={CHAT_URL}
        title="Chat"
        style={{ flex: 1, border: "none", width: "100%" }}
      />
    </div>
  );
}

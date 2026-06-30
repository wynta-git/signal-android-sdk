"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Crypto ─────────────────────────────────────────────────────────────────────

async function hmacSha256(secret: string, message: string): Promise<string> {
  if (!secret) return "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildCanonical(
  clientId: string,
  timestamp: string,
  qs: string,
  body: string,
  method: "GET" | "POST",
): string {
  const rawBody = method === "POST" ? body : "";
  return `${clientId}\n${timestamp}\n${qs}\n${rawBody}`;
}

// ── Endpoints ──────────────────────────────────────────────────────────────────

type Method = "GET" | "POST";

interface Endpoint {
  label: string;
  method: Method;
  upstreamPath: string;
  defaultQs: string;
  defaultBody: string;
}

const BASE = "https://qa-app.fozilpartners.com";

const ENDPOINTS: Endpoint[] = [
  {
    label: "GET applicable-codes",
    method: "GET",
    upstreamPath: "/api/v1/bonus/user-bonuses/applicable-codes",
    defaultQs: "user_id=P1001&chip_type=cash",
    defaultBody: "",
  },
  {
    label: "GET summary/{user_id}",
    method: "GET",
    upstreamPath: "/api/v1/bonus/user-bonuses/P1001/summary",
    defaultQs: "chip_type=cash",
    defaultBody: "",
  },
  {
    label: "GET transactions/{user_id}",
    method: "GET",
    upstreamPath: "/api/v1/bonus/user-bonuses/P1001/transactions",
    defaultQs: "chip_type=cash&limit=50",
    defaultBody: "",
  },
  {
    label: "GET transaction-detail/{user_id}",
    method: "GET",
    upstreamPath: "/api/v1/bonus/user-bonuses/P1001/transaction-detail",
    defaultQs: "id=1&type=GRANT",
    defaultBody: "",
  },
  {
    label: "GET transactions/{user_id}/{txn_id}",
    method: "GET",
    upstreamPath: "/api/v1/bonus/user-bonuses/P1001/transactions/42",
    defaultQs: "",
    defaultBody: "",
  },
  {
    label: "POST validate-code",
    method: "POST",
    upstreamPath: "/api/v1/bonus/user-bonuses/validate-code",
    defaultQs: "",
    defaultBody: JSON.stringify(
      { user_id: "P1001", chip_type: "cash", code: "GET_200%" },
      null,
      2,
    ),
  },
  {
    label: "POST consume",
    method: "POST",
    upstreamPath: "/api/v1/bonus/user-bonuses/consume",
    defaultQs: "",
    defaultBody: JSON.stringify(
      {
        user_id: "P1001",
        consume_txn_id: "con_P1001_001",
        wager_tnx_id: "wgr_P1001_001",
        bonus_amount: 10,
        transaction_amount: 100,
        chip_type: "CASH",
      },
      null,
      2,
    ),
  },
  {
    label: "POST consume/{txn_id}/revert",
    method: "POST",
    upstreamPath: "/api/v1/bonus/user-bonuses/consume/con_P1001_001/revert",
    defaultQs: "",
    defaultBody: "{}",
  },
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: "100svh",
    background: "#050508",
    color: "#e2e8f0",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    padding: "0 0 60px",
    WebkitFontSmoothing: "antialiased",
  } as React.CSSProperties,
  header: {
    background: "linear-gradient(165deg,#1a0d40 0%,#0f2060 60%,#0a1a40 100%)",
    padding: "40px 24px 28px",
    borderBottom: "1px solid #1e2040",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  } as React.CSSProperties,
  container: { maxWidth: 820, margin: "0 auto", padding: "0 16px" },
  tabs: {
    display: "flex",
    gap: 4,
    padding: "16px 0 0",
    borderBottom: "1px solid #1e2040",
    marginBottom: 28,
  } as React.CSSProperties,
  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    background: active ? "#6366f1" : "transparent",
    color: active ? "#fff" : "#64748b",
    border: active ? "1px solid #6366f1" : "1px solid transparent",
    borderRadius: "8px 8px 0 0",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    letterSpacing: "0.01em",
    transition: "all 0.15s",
  }),
  section: {
    background: "#0f0f18",
    border: "1px solid #1e2040",
    borderRadius: 12,
    padding: "18px 20px",
    marginBottom: 16,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    marginBottom: 14,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  } as React.CSSProperties,
  label: {
    fontSize: "0.72rem",
    color: "#64748b",
    marginBottom: 5,
    display: "block",
  } as React.CSSProperties,
  input: {
    width: "100%",
    background: "#0a0a14",
    border: "1px solid #252540",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "8px 12px",
    fontSize: "0.85rem",
    fontFamily: "monospace",
    outline: "none",
  } as React.CSSProperties,
  select: {
    width: "100%",
    background: "#0a0a14",
    border: "1px solid #252540",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "8px 12px",
    fontSize: "0.85rem",
    outline: "none",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    background: "#0a0a14",
    border: "1px solid #252540",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "8px 12px",
    fontSize: "0.82rem",
    fontFamily: "monospace",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 80,
  } as React.CSSProperties,
  code: {
    background: "#060610",
    border: "1px solid #1a1a30",
    borderRadius: 8,
    padding: "12px 14px",
    fontFamily: "monospace",
    fontSize: "0.8rem",
    overflowX: "auto" as const,
    whiteSpace: "pre" as const,
    lineHeight: 1.6,
  } as React.CSSProperties,
  copyBtn: {
    background: "#1e2040",
    border: "1px solid #2d3060",
    color: "#94a3b8",
    borderRadius: 6,
    padding: "4px 12px",
    fontSize: "0.72rem",
    cursor: "pointer",
    fontFamily: "monospace",
  } as React.CSSProperties,
  pill: (color: string): React.CSSProperties => ({
    display: "inline-block",
    background: color + "22",
    color: color,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: "0.75rem",
    fontFamily: "monospace",
    fontWeight: 600,
  }),
  nlMarker: {
    display: "inline-block",
    background: "#1e2040",
    color: "#475569",
    borderRadius: 3,
    padding: "0 4px",
    fontSize: "0.7rem",
    fontFamily: "monospace",
    marginRight: 2,
  } as React.CSSProperties,
};

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button style={S.copyBtn} onClick={copy}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ── Canonical string visualiser ────────────────────────────────────────────────

function CanonicalBreakdown({
  clientId,
  timestamp,
  qs,
  body,
  method,
}: {
  clientId: string;
  timestamp: string;
  qs: string;
  body: string;
  method: Method;
}) {
  const parts = [
    { label: "client_id", value: clientId || "(empty)", color: "#c084fc" },
    { label: "timestamp", value: timestamp || "(empty)", color: "#60a5fa" },
    { label: "query_string", value: qs || "(empty for POST)", color: "#4ade80" },
    {
      label: "body",
      value:
        method === "POST"
          ? body || '""'
          : '""  ← always empty for GET',
      color: "#fb923c",
    },
  ];
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        {parts.map((p, i) => (
          <div
            key={p.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "7px 0",
              borderBottom: i < parts.length - 1 ? "1px solid #1a1a30" : "none",
            }}
          >
            <span
              style={{
                ...S.pill(p.color),
                minWidth: 110,
                textAlign: "right" as const,
              }}
            >
              {p.label}
            </span>
            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>→</span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: p.color,
                wordBreak: "break-all" as const,
              }}
            >
              {p.value}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{ fontSize: "0.68rem", color: "#475569", marginBottom: 6 }}
      >
        Joined with <code style={{ color: "#4ade80" }}>\n</code> (newline):
      </div>
      <div style={S.code}>
        <span style={{ color: "#c084fc" }}>{clientId || "(empty)"}</span>
        <span style={S.nlMarker}>↵</span>
        <span style={{ color: "#60a5fa" }}>{timestamp || "(empty)"}</span>
        <span style={S.nlMarker}>↵</span>
        <span style={{ color: "#4ade80" }}>{qs || ""}</span>
        <span style={S.nlMarker}>↵</span>
        <span style={{ color: "#fb923c" }}>
          {method === "POST" ? body || "" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Generator tab ─────────────────────────────────────────────────────────────

function GeneratorTab() {
  const [clientId, setClientId] = useState("bonus-test-v1");
  const [secret, setSecret] = useState("abc@123456");
  const [epIdx, setEpIdx] = useState(0);
  const [qs, setQs] = useState(ENDPOINTS[0].defaultQs);
  const [body, setBody] = useState(ENDPOINTS[0].defaultBody);
  const [timestamp, setTimestamp] = useState(
    () => String(Math.floor(Date.now() / 1000)),
  );
  const [sig, setSig] = useState("");
  const [copiedCurl, setCopiedCurl] = useState(false);

  const ep = ENDPOINTS[epIdx];
  const canonical = buildCanonical(clientId, timestamp, qs, body, ep.method);

  useEffect(() => {
    void hmacSha256(secret, canonical).then(setSig);
  }, [secret, canonical]);

  function refreshTs() {
    setTimestamp(String(Math.floor(Date.now() / 1000)));
  }

  function onEpChange(idx: number) {
    setEpIdx(idx);
    setQs(ENDPOINTS[idx].defaultQs);
    setBody(ENDPOINTS[idx].defaultBody);
  }

  const upstreamUrl = `${BASE}${ep.upstreamPath}${qs ? `?${qs}` : ""}`;

  const curlLines =
    ep.method === "GET"
      ? [
          `curl -X GET '${upstreamUrl}' \\`,
          `  -H 'x-client-id: ${clientId}' \\`,
          `  -H 'x-timestamp: ${timestamp}' \\`,
          `  -H 'x-signature: ${sig}' \\`,
          `  -H 'Content-Type: application/json'`,
        ]
      : [
          `curl -X POST '${upstreamUrl}' \\`,
          `  -H 'x-client-id: ${clientId}' \\`,
          `  -H 'x-timestamp: ${timestamp}' \\`,
          `  -H 'x-signature: ${sig}' \\`,
          `  -H 'Content-Type: application/json' \\`,
          `  -d '${body.replace(/\n\s*/g, " ")}'`,
        ];

  const curlText = curlLines.join("\n");

  function copyCurl() {
    void navigator.clipboard.writeText(curlText).then(() => {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    });
  }

  return (
    <div>
      {/* Credentials */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Credentials</div>
        <div style={S.row}>
          <div>
            <label style={S.label}>Client ID</label>
            <input
              style={S.input}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="bonus-test-v1"
            />
          </div>
          <div>
            <label style={S.label}>Client Secret</label>
            <input
              style={S.input}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
      </div>

      {/* Request */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Request</div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Endpoint</label>
          <select
            style={S.select}
            value={epIdx}
            onChange={(e) => onEpChange(Number(e.target.value))}
          >
            {ENDPOINTS.map((e, i) => (
              <option key={i} value={i}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...S.row, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Method</label>
            <input
              style={{ ...S.input, color: ep.method === "GET" ? "#4ade80" : "#60a5fa" }}
              value={ep.method}
              readOnly
            />
          </div>
          <div>
            <label style={S.label}>
              Timestamp (Unix s)
              <button
                onClick={refreshTs}
                style={{
                  marginLeft: 8,
                  background: "none",
                  border: "none",
                  color: "#6366f1",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                  padding: 0,
                }}
              >
                ↺ now
              </button>
            </label>
            <input
              style={S.input}
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginBottom: ep.method === "POST" ? 12 : 0 }}>
          <label style={S.label}>
            Query String{" "}
            <span style={{ color: "#334155" }}>(without leading ?)</span>
          </label>
          <input
            style={S.input}
            value={qs}
            onChange={(e) => setQs(e.target.value)}
            placeholder="user_id=P1001&chip_type=cash"
          />
        </div>
        {ep.method === "POST" && (
          <div>
            <label style={S.label}>Request Body (raw JSON)</label>
            <textarea
              style={S.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>
        )}
      </div>

      {/* Step 1: canonical string */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Step 1 — Build the Canonical String</div>
        <CanonicalBreakdown
          clientId={clientId}
          timestamp={timestamp}
          qs={qs}
          body={body}
          method={ep.method}
        />
      </div>

      {/* Step 2: signature */}
      <div style={S.section}>
        <div
          style={{
            ...S.sectionTitle,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Step 2 — HMAC-SHA256(secret, canonical)</span>
          <CopyBtn text={sig} />
        </div>
        <div style={{ ...S.code, color: "#fbbf24", wordBreak: "break-all" as const }}>
          {sig || "(enter a secret above)"}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: "0.72rem",
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          <code style={{ color: "#94a3b8" }}>
            HMAC-SHA256(key=&lt;secret&gt;, message=&lt;canonical&gt;) → hex
          </code>
        </div>
      </div>

      {/* Step 3: headers */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Step 3 — Headers to Send</div>
        <div style={S.code}>
          <div>
            <span style={{ color: "#60a5fa" }}>x-client-id</span>
            <span style={{ color: "#475569" }}>: </span>
            <span style={{ color: "#c084fc" }}>{clientId}</span>
          </div>
          <div>
            <span style={{ color: "#60a5fa" }}>x-timestamp</span>
            <span style={{ color: "#475569" }}>: </span>
            <span style={{ color: "#60a5fa" }}>{timestamp}</span>
          </div>
          <div>
            <span style={{ color: "#60a5fa" }}>x-signature</span>
            <span style={{ color: "#475569" }}>: </span>
            <span style={{ color: "#fbbf24" }}>{sig || "…"}</span>
          </div>
          <div>
            <span style={{ color: "#60a5fa" }}>Content-Type</span>
            <span style={{ color: "#475569" }}>: </span>
            <span style={{ color: "#94a3b8" }}>application/json</span>
          </div>
        </div>
      </div>

      {/* cURL */}
      <div style={S.section}>
        <div
          style={{
            ...S.sectionTitle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>cURL — Direct to Upstream</span>
          <button style={S.copyBtn} onClick={copyCurl}>
            {copiedCurl ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div style={{ ...S.code, color: "#e2e8f0" }}>
          {curlLines.map((l, i) => (
            <div key={i}>
              {l.startsWith("  -H") ? (
                <>
                  <span style={{ color: "#475569" }}>  </span>
                  <span style={{ color: "#60a5fa" }}>-H </span>
                  <span style={{ color: "#4ade80" }}>{l.replace("  -H ", "")}</span>
                </>
              ) : l.startsWith("  -d") ? (
                <>
                  <span style={{ color: "#475569" }}>  </span>
                  <span style={{ color: "#fb923c" }}>-d </span>
                  <span style={{ color: "#fbbf24" }}>{l.replace("  -d ", "")}</span>
                </>
              ) : (
                <>
                  <span style={{ color: "#c084fc" }}>
                    {l.split(" ")[0]} {l.split(" ")[1]}{" "}
                  </span>
                  <span style={{ color: "#4ade80" }}>
                    {l.split(" ").slice(2).join(" ")}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        <div
          style={{ marginTop: 10, fontSize: "0.7rem", color: "#334155" }}
        >
          ⚠ Timestamp expires — signatures are typically valid for ±5 min. Use ↺ now to refresh.
        </div>
      </div>
    </div>
  );
}

// ── Validator tab ─────────────────────────────────────────────────────────────

function ValidatorTab() {
  const [secret, setSecret] = useState("abc@123456");
  const [clientId, setClientId] = useState("bonus-test-v1");
  const [timestamp, setTimestamp] = useState("");
  const [method, setMethod] = useState<Method>("GET");
  const [qs, setQs] = useState("");
  const [body, setBody] = useState("");
  const [claimedSig, setClaimedSig] = useState("");
  const [recomputed, setRecomputed] = useState("");

  const canonical = buildCanonical(clientId, timestamp, qs, body, method);

  useEffect(() => {
    void hmacSha256(secret, canonical).then(setRecomputed);
  }, [secret, canonical]);

  const tsAge =
    timestamp
      ? Math.floor(Date.now() / 1000) - Number(timestamp)
      : null;
  const tsAgeLabel =
    tsAge === null
      ? null
      : tsAge < 0
        ? `${Math.abs(tsAge)}s in the future`
        : tsAge < 60
          ? `${tsAge}s old`
          : `${Math.floor(tsAge / 60)}m ${tsAge % 60}s old`;
  const tsStale = tsAge !== null && Math.abs(tsAge) > 300;

  const sigMatch =
    claimedSig.length > 0 && recomputed.length > 0
      ? claimedSig.toLowerCase() === recomputed.toLowerCase()
      : null;

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Verify an Incoming Signature</div>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
          Paste the values from the incoming request headers and body. The page
          recomputes the expected signature and checks it against the claimed one.
        </p>
        <div style={{ ...S.row, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Client ID (from x-client-id)</label>
            <input style={S.input} value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Client Secret</label>
            <input style={S.input} type="password" value={secret} onChange={e => setSecret(e.target.value)} />
          </div>
        </div>
        <div style={{ ...S.row, marginBottom: 12 }}>
          <div>
            <label style={S.label}>
              Timestamp (from x-timestamp)
              {tsAgeLabel && (
                <span
                  style={{
                    marginLeft: 8,
                    color: tsStale ? "#f87171" : "#4ade80",
                    fontSize: "0.7rem",
                  }}
                >
                  {tsAgeLabel} {tsStale ? "⚠ STALE" : "✓ FRESH"}
                </span>
              )}
            </label>
            <input
              style={S.input}
              value={timestamp}
              onChange={e => setTimestamp(e.target.value)}
              placeholder="1782804914"
            />
          </div>
          <div>
            <label style={S.label}>Method</label>
            <select style={S.select} value={method} onChange={e => setMethod(e.target.value as Method)}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Query String (without leading ?)</label>
          <input style={S.input} value={qs} onChange={e => setQs(e.target.value)} placeholder="user_id=P1001&chip_type=cash" />
        </div>
        {method === "POST" && (
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Request Body (raw JSON)</label>
            <textarea style={S.textarea} value={body} onChange={e => setBody(e.target.value)} rows={4} />
          </div>
        )}
        <div>
          <label style={S.label}>Claimed Signature (from x-signature)</label>
          <input
            style={{ ...S.input, fontFamily: "monospace", fontSize: "0.75rem" }}
            value={claimedSig}
            onChange={e => setClaimedSig(e.target.value.trim())}
            placeholder="75d8b86a…"
          />
        </div>
      </div>

      {/* Result */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Verification Result</div>
        {sigMatch === null && (
          <div style={{ color: "#475569", fontSize: "0.85rem" }}>
            Fill in all fields above to verify.
          </div>
        )}
        {sigMatch !== null && (
          <div
            style={{
              background: sigMatch ? "#0a280a" : "#280a0a",
              border: `1px solid ${sigMatch ? "#166534" : "#7f1d1d"}`,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: "1.4rem" }}>{sigMatch ? "✅" : "❌"}</span>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  color: sigMatch ? "#6ee7b7" : "#f87171",
                }}
              >
                {sigMatch ? "Signature Valid" : "Signature Mismatch"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                {sigMatch
                  ? "The claimed signature matches the recomputed one."
                  : "The claimed signature does not match. Check the canonical string inputs."}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 8, fontSize: "0.72rem", color: "#475569" }}>
          Canonical string used:
        </div>
        <CanonicalBreakdown clientId={clientId} timestamp={timestamp} qs={qs} body={body} method={method} />

        <div style={{ marginTop: 16, marginBottom: 6, fontSize: "0.72rem", color: "#475569", display: "flex", justifyContent: "space-between" }}>
          <span>Recomputed signature:</span>
          <CopyBtn text={recomputed} />
        </div>
        <div style={{ ...S.code, color: "#fbbf24", wordBreak: "break-all" as const, marginBottom: 8 }}>
          {recomputed || "(enter secret above)"}
        </div>

        {claimedSig && (
          <>
            <div style={{ marginBottom: 6, fontSize: "0.72rem", color: "#475569" }}>
              Claimed signature:
            </div>
            <div
              style={{
                ...S.code,
                color: sigMatch ? "#6ee7b7" : "#f87171",
                wordBreak: "break-all" as const,
              }}
            >
              {claimedSig}
            </div>
          </>
        )}
      </div>

      {/* Explanation */}
      <div style={S.section}>
        <div style={S.sectionTitle}>What the server validates</div>
        <div style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: 1.8 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>1. Timestamp window</span>
            <br />
            Reject if <code style={{ color: "#e2e8f0" }}>|now − x-timestamp| &gt; 300s</code> (5 min). Prevents replay attacks.
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>2. Recompute canonical string</span>
            <br />
            Build <code style={{ color: "#e2e8f0" }}>{"clientId\\ntimestamp\\nqs\\nbody"}</code> from the known secret + request parts.
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>3. HMAC-SHA256</span>
            <br />
            Compute <code style={{ color: "#e2e8f0" }}>HMAC-SHA256(secret, canonical)</code> and compare to <code style={{ color: "#e2e8f0" }}>x-signature</code> using a constant-time compare.
          </div>
          <div>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>4. Client ID lookup</span>
            <br />
            Look up the secret for <code style={{ color: "#e2e8f0" }}>x-client-id</code> in the database. Unknown client IDs are rejected before computing anything.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Algorithm reference ────────────────────────────────────────────────────────

function AlgoReference() {
  const code = `// lib/s2s.ts — how the proxy signs each request
const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody   = method === 'POST' ? (bodyJson ?? '') : '';
const canonical = \`\${clientId}\\n\${timestamp}\\n\${qs}\\n\${rawBody}\`;
const signature = createHmac('sha256', secret)
                    .update(canonical).digest('hex');

// Headers sent to upstream:
// x-client-id: <clientId>
// x-timestamp: <timestamp>
// x-signature: <signature>
// Content-Type: application/json`;

  return (
    <div style={S.section}>
      <div
        style={{
          ...S.sectionTitle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Algorithm Reference (lib/s2s.ts)</span>
        <CopyBtn text={code} />
      </div>
      <div style={{ ...S.code, color: "#94a3b8" }}>
        {code.split("\n").map((line, i) => {
          if (line.startsWith("//")) {
            return (
              <div key={i} style={{ color: "#334155" }}>
                {line}
              </div>
            );
          }
          return <div key={i}>{line}</div>;
        })}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function SignPage() {
  const [tab, setTab] = useState<"generate" | "validate">("generate");

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e2e8f0" }}>
            S2S Signature Explorer
          </div>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
            HMAC-SHA256 signing · bonus-client-test
          </div>
        </div>
        <Link
          href="/"
          style={{
            color: "#6366f1",
            textDecoration: "none",
            fontSize: "0.8rem",
            border: "1px solid #3730a3",
            borderRadius: 8,
            padding: "6px 14px",
          }}
        >
          ← App
        </Link>
      </div>

      <div style={S.container}>
        <div style={S.tabs}>
          <button style={S.tabBtn(tab === "generate")} onClick={() => setTab("generate")}>
            Generate
          </button>
          <button style={S.tabBtn(tab === "validate")} onClick={() => setTab("validate")}>
            Validate
          </button>
        </div>

        <AlgoReference />

        {tab === "generate" && <GeneratorTab />}
        {tab === "validate" && <ValidatorTab />}
      </div>
    </div>
  );
}

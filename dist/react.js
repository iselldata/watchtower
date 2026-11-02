"use client";

// src/react.tsx
import { useEffect } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function tell(error, where, endpoint) {
  try {
    const body = JSON.stringify({ where, message: error.message, digest: error.digest, stack: error.stack });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    else void fetch(endpoint, { method: "POST", body, keepalive: true });
  } catch {
  }
}
function ErrorPage({
  error,
  reset,
  where,
  endpoint = "/api/report-error",
  title = "Something went wrong on our side.",
  message = "Nothing you did caused it, and we have a note of it. Try again, and if it happens once more, go back to the start.",
  retryLabel = "Try again",
  startLabel = "Go to the start",
  startHref = "/",
  accent = "#111827",
  accentText = "#ffffff"
}) {
  useEffect(() => {
    tell(error, where ?? (typeof location !== "undefined" ? location.pathname : "page"), endpoint);
  }, [error, where, endpoint]);
  const button = { minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 24px", borderRadius: 999, fontSize: 16, fontWeight: 600, cursor: "pointer", font: "inherit" };
  return /* @__PURE__ */ jsx("div", { style: { minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px" }, children: /* @__PURE__ */ jsxs("div", { style: { maxWidth: 420, textAlign: "center" }, children: [
    /* @__PURE__ */ jsx("h1", { style: { fontSize: 24, lineHeight: 1.25, fontWeight: 700, margin: 0 }, children: title }),
    /* @__PURE__ */ jsx("p", { style: { fontSize: 16, lineHeight: 1.5, opacity: 0.75, margin: "12px 0 24px" }, children: message }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }, children: [
      reset && /* @__PURE__ */ jsx("button", { type: "button", onClick: reset, style: { ...button, border: 0, background: accent, color: accentText, fontWeight: 600 }, children: retryLabel }),
      /* @__PURE__ */ jsx("a", { href: startHref, style: { ...button, border: "1px solid currentColor", color: "inherit", textDecoration: "none", fontWeight: 600 }, children: startLabel })
    ] })
  ] }) });
}
function GlobalErrorPage({ background = "#ffffff", color = "#111827", ...props }) {
  return /* @__PURE__ */ jsx("html", { lang: "en", children: /* @__PURE__ */ jsx("body", { style: { margin: 0, fontFamily: "system-ui, sans-serif", background, color }, children: /* @__PURE__ */ jsx(ErrorPage, { ...props, where: props.where ?? "global" }) }) });
}
export {
  ErrorPage,
  GlobalErrorPage
};

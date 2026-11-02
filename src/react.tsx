import { useEffect, type CSSProperties, type ReactNode } from "react";

// What a person sees when a page crashes, in place of the framework's blank one. It tells them in plain words that it is not their
// doing, offers the two ways on, and sends a short note of what broke to the app's own /api/report-error, which writes it to the
// logs and to Telegram. Styled inline so it looks right in any app, whatever its stylesheet is.
export interface ErrorPageProps {
  error: Error & { digest?: string };
  // Next gives error.tsx a reset function; with it, a Try again button shows.
  reset?: () => void;
  // Named in the note, so the report says which page crashed. Default: the address.
  where?: string;
  // Where the note goes. Default /api/report-error.
  endpoint?: string;
  title?: ReactNode;
  message?: ReactNode;
  retryLabel?: string;
  startLabel?: string;
  startHref?: string;
  // The button colour and the text on it.
  accent?: string;
  accentText?: string;
}

function tell(error: Error & { digest?: string }, where: string, endpoint: string) {
  try {
    const body = JSON.stringify({ where, message: error.message, digest: error.digest, stack: error.stack });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    else void fetch(endpoint, { method: "POST", body, keepalive: true });
  } catch {
    // The note is a courtesy; the page still works without it.
  }
}

export function ErrorPage({
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
  accentText = "#ffffff",
}: ErrorPageProps) {
  useEffect(() => {
    tell(error, where ?? (typeof location !== "undefined" ? location.pathname : "page"), endpoint);
  }, [error, where, endpoint]);
  const button: CSSProperties = { minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 24px", borderRadius: 999, fontSize: 16, fontWeight: 600, cursor: "pointer", font: "inherit" };
  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, lineHeight: 1.25, fontWeight: 700, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, opacity: 0.75, margin: "12px 0 24px" }}>{message}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          {reset && (
            <button type="button" onClick={reset} style={{ ...button, border: 0, background: accent, color: accentText, fontWeight: 600 }}>
              {retryLabel}
            </button>
          )}
          {/* A plain link on purpose: it starts the page again from nothing. */}
          <a href={startHref} style={{ ...button, border: "1px solid currentColor", color: "inherit", textDecoration: "none", fontWeight: 600 }}>
            {startLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

// For global-error.tsx, which replaces the whole page and so has to bring its own html and body.
export function GlobalErrorPage({ background = "#ffffff", color = "#111827", ...props }: ErrorPageProps & { background?: string; color?: string }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background, color }}>
        <ErrorPage {...props} where={props.where ?? "global"} />
      </body>
    </html>
  );
}

// Mounted once in the root layout: tells the app's /api/report-error about errors on the page that no error screen would see, such as a
// button handler that throws or a promise nobody caught. It skips what is not our problem (browser extensions, a lost connection),
// sends each message once, and no more than five a page.
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Failed to fetch/i, /Load failed/i, /NetworkError/i, /network request failed/i, /The operation was aborted/i, /AbortError/i, /Non-Error promise rejection/i];

export function WatchtowerListener({ endpoint = "/api/report-error" }: { endpoint?: string }) {
  useEffect(() => {
    const sent = new Set<string>();
    const report = (message: string, stack: string | undefined, source: string | undefined) => {
      if (sent.size >= 5 || sent.has(message) || NOISE.some((n) => n.test(message))) return;
      // An error from a script that is not ours (an extension, an injected ad) is not ours to fix.
      if (source && !source.startsWith(location.origin) && !source.startsWith("webpack") && source !== "") return;
      sent.add(message);
      tell({ name: "Error", message, stack } as Error, `${location.pathname} (uncaught)`, endpoint);
    };
    const onError = (e: ErrorEvent) => report(e.message || String(e.error), e.error?.stack, e.filename);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined, undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [endpoint]);
  return null;
}

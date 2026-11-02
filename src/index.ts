// Watchtower: where a problem is written down so it can be found in the host's logs, and sent to a Telegram chat when one is set up.
// One line of JSON each, starting with a word to search for: [error] something broke, [rejected] a request was refused as invalid,
// [browser] a page crashed on somebody's phone. Nothing a customer typed goes in: only where it happened, the field that was
// refused and the message. No dependencies, and nothing here needs Node, so it also runs on the edge.

export type Kind = "error" | "rejected" | "browser";

export interface WatchtowerOptions {
  // Default: the TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables. Without both, nothing is sent and the logs still get everything.
  token?: string;
  chatId?: string;
  // Named in every message so one bot can serve every app. Default: the address the host gives the deployment, else "local".
  app?: string;
  // The same problem is sent once, then counted, and mentioned again after this long. Default five minutes.
  quietMs?: number;
  // The most messages that go out in a minute from one server. Default 12.
  perMinute?: number;
  // For tests: stands in for fetch when talking to Telegram.
  fetch?: typeof fetch;
}

export interface Issue {
  path: (string | number)[];
  message: string;
}

const cut = (text: unknown, max: number) => String(text ?? "").slice(0, max);
const env = (name: string): string | undefined => (typeof process !== "undefined" ? process.env?.[name] : undefined);

export function createWatchtower(options: WatchtowerOptions = {}) {
  const token = () => options.token ?? env("TELEGRAM_BOT_TOKEN");
  const chat = () => options.chatId ?? env("TELEGRAM_CHAT_ID");
  const quietMs = options.quietMs ?? 5 * 60_000;
  const perMinute = options.perMinute ?? 12;
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const app = () => options.app ?? env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL") ?? "local";

  // Each server keeps its own count, which is enough to stop one bug on a busy shop being a flood.
  const seen = new Map<string, { sentAt: number; held: number }>();
  let windowStart = 0;
  let sentInWindow = 0;

  function allowed(key: string): { send: boolean; held: number } {
    const now = Date.now();
    const before = seen.get(key);
    if (before && now - before.sentAt < quietMs) {
      before.held += 1;
      return { send: false, held: 0 };
    }
    if (now - windowStart > 60_000) {
      windowStart = now;
      sentInWindow = 0;
    }
    if (sentInWindow >= perMinute) {
      if (before) before.held += 1;
      return { send: false, held: 0 };
    }
    sentInWindow += 1;
    const held = before?.held ?? 0;
    seen.set(key, { sentAt: now, held: 0 });
    // The list of what has been seen does not grow without end.
    if (seen.size > 200) {
      for (const k of seen.keys()) {
        seen.delete(k);
        if (seen.size <= 100) break;
      }
    }
    return { send: true, held };
  }

  // Sent after the answer has gone, where the host lets work carry on past it, so nobody waits on Telegram. A failure is only logged.
  async function post(text: string) {
    const t = token();
    const c = chat();
    if (!t || !c) return;
    try {
      await send(`https://api.telegram.org/bot${t}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: c, text: text.slice(0, 3800), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      console.warn("[telegram] could not send");
    }
  }

  function keepAlive(work: Promise<unknown>) {
    // Vercel's way of saying "do not freeze this function yet". Anywhere else there is nothing to ask and the send simply carries on.
    const context = (globalThis as { [k: symbol]: { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined })[Symbol.for("@vercel/request-context")];
    context?.get?.()?.waitUntil?.(work);
  }

  function tell(kind: Kind, fields: Record<string, unknown>) {
    if (!token() || !chat()) return;
    // A crash is the same problem wherever it surfaced (the route that failed, the log line that mentioned it), so it is counted by its
    // message; a refused request is told apart by the route and the fields.
    const key = (kind === "rejected" ? `${kind}|${cut(fields.where, 80)}|${JSON.stringify(fields.issues ?? "")}` : `${kind}|${cut(fields.message, 120)}`).slice(0, 300);
    const turn = allowed(key);
    if (!turn.send) return;
    const label = kind === "error" ? "ERROR on the server" : kind === "browser" ? "CRASH on a phone or browser" : "REFUSED a request";
    const vercelEnv = env("VERCEL_ENV");
    const sha = env("VERCEL_GIT_COMMIT_SHA");
    const rows = [
      label,
      `${app()}${vercelEnv ? ` (${vercelEnv})` : ""}${sha ? ` ${sha.slice(0, 7)}` : ""}`,
      `Where: ${cut(fields.where, 200)}`,
      fields.message ? `Message: ${cut(fields.message, 400)}` : "",
      Array.isArray(fields.issues) ? `Fields: ${(fields.issues as { field: string; message: string }[]).map((i) => `${i.field}: ${i.message}`).join("; ")}` : "",
      fields.digest ? `Digest: ${fields.digest}` : "",
      fields.userAgent ? `Device: ${fields.userAgent}` : "",
      turn.held > 0 ? `Also happened ${turn.held} more time${turn.held === 1 ? "" : "s"} since the last message.` : "",
      fields.stack ? `\n${cut(fields.stack, 900)}` : "",
    ].filter(Boolean);
    const work = post(rows.join("\n"));
    keepAlive(work);
    void work;
  }

  function line(kind: Kind, fields: Record<string, unknown>) {
    const out = `[${kind}] ${JSON.stringify(fields)}`;
    if (kind === "rejected") console.warn(out);
    else console.error(out);
    tell(kind, fields);
  }

  // Something unexpected threw. `where` says which route or page.
  function reportError(where: string, error: unknown, extra: Record<string, unknown> = {}) {
    const e = error instanceof Error ? error : new Error(cut(error, 300));
    line("error", { where, name: e.name, message: cut(e.message, 400), digest: (error as { digest?: string } | null)?.digest, stack: cut(e.stack, 1200), ...extra });
  }

  // A request was refused because what it carried did not pass. Only the field names and messages are written, never the values.
  // Takes the issues of a zod error as they are.
  function reportRejected(where: string, issues: Issue[]) {
    line("rejected", { where, issues: issues.slice(0, 5).map((i) => ({ field: i.path.join(".") || "(body)", message: cut(i.message, 160) })) });
  }

  // A page crashed in somebody's browser and told us so. The body is untrusted, so each part is trimmed to a short text.
  function reportBrowserError(body: unknown, userAgent: string | null) {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    line("browser", { where: cut(b.where, 200), message: cut(b.message, 400), digest: cut(b.digest, 60) || undefined, stack: cut(b.stack, 1200), userAgent: cut(userAgent, 160) });
  }

  // For an app's /api/report-error route (POST). A small body only; always answers 204 so a crash page never waits on it.
  async function handleBrowserErrorReport(request: Request): Promise<Response> {
    try {
      const text = await request.text();
      if (text.length > 4000) return new Response(null, { status: 204 });
      reportBrowserError(JSON.parse(text), request.headers.get("user-agent"));
    } catch {
      // Not worth a second error about the first.
    }
    return new Response(null, { status: 204 });
  }

  // For the same route's GET: proves the Telegram keys work by sending one message. It needs the chat id in the address
  // (?test=<chat id>), so it is not something a stranger can set off.
  async function handleErrorReportTest(request: Request): Promise<Response> {
    const c = chat();
    const given = new URL(request.url).searchParams.get("test");
    if (!token() || !c) return new Response("Telegram is not set up here: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are missing.", { status: 200 });
    if (given !== c) return new Response(null, { status: 404 });
    await post(`Test message from ${app()}. If you can read this, errors will reach you here.`);
    return new Response("Sent. Look in Telegram.", { status: 200 });
  }

  // Next's onRequestError hook: export it from instrumentation.ts and every unexpected server error is reported with its route.
  function onRequestError(error: unknown, request: { path: string; method: string }, context: { routerKind?: string; routePath?: string; routeType?: string }) {
    reportError(`${request.method} ${context.routePath ?? request.path}`, error, { routeType: context.routeType, routerKind: context.routerKind });
  }

  // Many routes catch their own errors, log them with console.error and answer 500, which Next counts as handled, so onRequestError never
  // sees them. This listens to console.error instead: whenever an Error is logged, it is reported as well as logged. Call it once when the
  // server starts (instrumentation.ts register). Our own lines, which start with [error], [rejected], [browser] or [telegram], are skipped.
  let watching = false;
  function watchConsole() {
    if (watching) return;
    watching = true;
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      original(...args);
      try {
        if (typeof args[0] === "string" && /^\[(error|rejected|browser|telegram)\]/.test(args[0])) return;
        const error = args.find((a) => a instanceof Error);
        if (!error) return;
        const label = typeof args[0] === "string" ? args[0].replace(/[\s:]+$/, "") : "logged error";
        reportError(label, error, { logged: true });
      } catch {
        // Reporting must never break the logging it listens to.
      }
    };
  }

  return { reportError, reportRejected, reportBrowserError, handleBrowserErrorReport, handleErrorReportTest, onRequestError, watchConsole };
}

// The one most apps need, reading its keys from the environment.
const watchtower = createWatchtower();
export const { reportError, reportRejected, reportBrowserError, handleBrowserErrorReport, handleErrorReportTest, onRequestError, watchConsole } = watchtower;

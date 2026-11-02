// src/index.ts
var cut = (text, max) => String(text ?? "").slice(0, max);
var env = (name) => typeof process !== "undefined" ? process.env?.[name] : void 0;
function createWatchtower(options = {}) {
  const token = () => options.token ?? env("TELEGRAM_BOT_TOKEN");
  const chat = () => options.chatId ?? env("TELEGRAM_CHAT_ID");
  const quietMs = options.quietMs ?? 5 * 6e4;
  const perMinute = options.perMinute ?? 12;
  const send = options.fetch ?? ((...args) => fetch(...args));
  const app = () => options.app ?? env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL") ?? "local";
  const seen = /* @__PURE__ */ new Map();
  let windowStart = 0;
  let sentInWindow = 0;
  function allowed(key) {
    const now = Date.now();
    const before = seen.get(key);
    if (before && now - before.sentAt < quietMs) {
      before.held += 1;
      return { send: false, held: 0 };
    }
    if (now - windowStart > 6e4) {
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
    if (seen.size > 200) {
      for (const k of seen.keys()) {
        seen.delete(k);
        if (seen.size <= 100) break;
      }
    }
    return { send: true, held };
  }
  async function post(text) {
    const t = token();
    const c = chat();
    if (!t || !c) return;
    try {
      await send(`https://api.telegram.org/bot${t}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: c, text: text.slice(0, 3800), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(4e3)
      });
    } catch {
      console.warn("[telegram] could not send");
    }
  }
  function keepAlive(work) {
    const context = globalThis[/* @__PURE__ */ Symbol.for("@vercel/request-context")];
    context?.get?.()?.waitUntil?.(work);
  }
  function tell(kind, fields) {
    if (!token() || !chat()) return;
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
      Array.isArray(fields.issues) ? `Fields: ${fields.issues.map((i) => `${i.field}: ${i.message}`).join("; ")}` : "",
      fields.digest ? `Digest: ${fields.digest}` : "",
      fields.userAgent ? `Device: ${fields.userAgent}` : "",
      turn.held > 0 ? `Also happened ${turn.held} more time${turn.held === 1 ? "" : "s"} since the last message.` : "",
      fields.stack ? `
${cut(fields.stack, 900)}` : ""
    ].filter(Boolean);
    const work = post(rows.join("\n"));
    keepAlive(work);
    void work;
  }
  function line(kind, fields) {
    const out = `[${kind}] ${JSON.stringify(fields)}`;
    if (kind === "rejected") console.warn(out);
    else console.error(out);
    tell(kind, fields);
  }
  function reportError2(where, error, extra = {}) {
    const e = error instanceof Error ? error : new Error(cut(error, 300));
    line("error", { where, name: e.name, message: cut(e.message, 400), digest: error?.digest, stack: cut(e.stack, 1200), ...extra });
  }
  function reportRejected2(where, issues) {
    line("rejected", { where, issues: issues.slice(0, 5).map((i) => ({ field: i.path.join(".") || "(body)", message: cut(i.message, 160) })) });
  }
  function reportBrowserError2(body, userAgent) {
    const b = body && typeof body === "object" ? body : {};
    line("browser", { where: cut(b.where, 200), message: cut(b.message, 400), digest: cut(b.digest, 60) || void 0, stack: cut(b.stack, 1200), userAgent: cut(userAgent, 160) });
  }
  async function handleBrowserErrorReport2(request) {
    try {
      const text = await request.text();
      if (text.length > 4e3) return new Response(null, { status: 204 });
      reportBrowserError2(JSON.parse(text), request.headers.get("user-agent"));
    } catch {
    }
    return new Response(null, { status: 204 });
  }
  async function handleErrorReportTest2(request) {
    const c = chat();
    const given = new URL(request.url).searchParams.get("test");
    if (!token() || !c) return new Response("Telegram is not set up here: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are missing.", { status: 200 });
    if (given !== c) return new Response(null, { status: 404 });
    await post(`Test message from ${app()}. If you can read this, errors will reach you here.`);
    return new Response("Sent. Look in Telegram.", { status: 200 });
  }
  function onRequestError2(error, request, context) {
    reportError2(`${request.method} ${context.routePath ?? request.path}`, error, { routeType: context.routeType, routerKind: context.routerKind });
  }
  let watching = false;
  function watchConsole2() {
    if (watching) return;
    watching = true;
    const original = console.error.bind(console);
    console.error = (...args) => {
      original(...args);
      try {
        if (typeof args[0] === "string" && /^\[(error|rejected|browser|telegram)\]/.test(args[0])) return;
        const error = args.find((a) => a instanceof Error);
        if (!error) return;
        const label = typeof args[0] === "string" ? args[0].replace(/[\s:]+$/, "") : "logged error";
        reportError2(label, error, { logged: true });
      } catch {
      }
    };
  }
  return { reportError: reportError2, reportRejected: reportRejected2, reportBrowserError: reportBrowserError2, handleBrowserErrorReport: handleBrowserErrorReport2, handleErrorReportTest: handleErrorReportTest2, onRequestError: onRequestError2, watchConsole: watchConsole2 };
}
var watchtower = createWatchtower();
var { reportError, reportRejected, reportBrowserError, handleBrowserErrorReport, handleErrorReportTest, onRequestError, watchConsole } = watchtower;

export {
  createWatchtower,
  reportError,
  reportRejected,
  reportBrowserError,
  handleBrowserErrorReport,
  handleErrorReportTest,
  onRequestError,
  watchConsole
};

// src/index.ts
var KNOWN = [
  {
    match: /removeChild|insertBefore|not a child of this node/i,
    means: "The page stopped because the phone's own translator, or an add-on, rewrote the words on it.",
    todo: "Ask them to switch off Translate (or open the page in another browser) and try again."
  },
  {
    match: /ChunkLoadError|Loading chunk .* failed|dynamically imported module/i,
    means: "Their phone was holding an old copy of the app from before an update and could not load a part of the new one.",
    todo: "Ask them to refresh the page. Nothing is broken on our side."
  },
  {
    match: /hydrat/i,
    means: "The page looked different when it reached their phone from how we sent it, often because of a translator or an add-on.",
    todo: "Ask them to refresh, or to switch off Translate, and try again."
  },
  {
    match: /FormData|Unexpected end of form|body.*(aborted|cut off)|premature close/i,
    means: "Something they were sending was cut off on the way, usually a weak connection.",
    todo: "Ask them to try again, on better signal or Wi-Fi."
  },
  {
    match: /MongoServerSelection|MongoNetwork|MongoTimeout|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
    means: "The database did not answer for a moment.",
    todo: "It usually passes by itself. If it keeps coming, look at the database."
  },
  {
    match: /Cannot read propert|is not a function|is not defined|undefined is not an object/i,
    means: "A mistake in our own code: a screen asked for something that was not there. It is not their fault.",
    todo: "Tell them we are on it, and send this whole message to whoever builds the app."
  }
];
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
  let whoFn = options.who;
  let windowStart = 0;
  let sentInWindow = 0;
  const person = (who) => {
    if (!who) return "";
    const entries = Object.values(who).filter((v) => !!v);
    return entries.slice(0, 2).join(", ");
  };
  function allowed(key, who) {
    const now = Date.now();
    const before = seen.get(key);
    if (before && now - before.sentAt < quietMs) {
      before.held += 1;
      if (who && !before.people.includes(who) && before.people.length < 6) before.people.push(who);
      return { send: false, held: 0, people: [] };
    }
    if (now - windowStart > 6e4) {
      windowStart = now;
      sentInWindow = 0;
    }
    if (sentInWindow >= perMinute) {
      if (before) before.held += 1;
      return { send: false, held: 0, people: [] };
    }
    sentInWindow += 1;
    const held = before?.held ?? 0;
    const people = before?.people ?? [];
    seen.set(key, { sentAt: now, held: 0, people: [] });
    if (seen.size > 200) {
      for (const k of seen.keys()) {
        seen.delete(k);
        if (seen.size <= 100) break;
      }
    }
    return { send: true, held, people };
  }
  async function resolveWho() {
    if (!whoFn) return void 0;
    try {
      return await Promise.race([Promise.resolve(whoFn()), new Promise((done) => setTimeout(() => done(void 0), 1500))]);
    } catch {
      return void 0;
    }
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
    const work = (async () => {
      const who = await resolveWho();
      const key = (kind === "rejected" ? `${kind}|${cut(fields.where, 80)}|${JSON.stringify(fields.issues ?? "")}` : `${kind}|${cut(fields.message, 120)}`).slice(0, 300);
      const turn = allowed(key, person(who));
      if (!turn.send) return;
      const label = kind === "error" ? "ERROR on the server" : kind === "browser" ? "CRASH on a phone or browser" : "REFUSED a request";
      const vercelEnv = env("VERCEL_ENV");
      const sha = env("VERCEL_GIT_COMMIT_SHA");
      const known = [...options.explain ?? [], ...KNOWN].find((e) => e.match.test(`${fields.message ?? ""} ${fields.stack ?? ""}`));
      const plain = kind === "rejected" ? ["What it means: A request was turned away because a box was empty or not filled in the way we need.", "What to do: Nothing yet. If the same one keeps coming, that form is probably unclear and should be made simpler."] : known ? [`What it means: ${known.means}`, known.todo ? `What to do: ${known.todo}` : ""] : ["What it means: Not one we know yet.", "What to do: Send this whole message to whoever builds the app."];
      const rows = [
        label,
        `${app()}${vercelEnv ? ` (${vercelEnv})` : ""}${sha ? ` ${sha.slice(0, 7)}` : ""}`,
        ...plain,
        ...who ? Object.entries(who).filter(([, v]) => !!v).map(([k, v]) => `${k}: ${cut(v, 200)}`) : [],
        `Where: ${cut(fields.where, 200)}`,
        fields.message ? `Message: ${cut(fields.message, 400)}` : "",
        Array.isArray(fields.issues) ? `Fields: ${fields.issues.map((i) => `${i.field}: ${i.message}`).join("; ")}` : "",
        fields.digest ? `Digest: ${fields.digest}` : "",
        fields.userAgent ? `Device: ${fields.userAgent}` : "",
        turn.held > 0 ? `Also happened ${turn.held} more time${turn.held === 1 ? "" : "s"} since the last message${turn.people.length ? `, to: ${turn.people.join(" | ")}` : ""}.` : "",
        fields.stack ? `
${cut(fields.stack, 900)}` : ""
      ].filter(Boolean);
      await post(rows.join("\n"));
    })();
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
  function setWho2(fn) {
    whoFn = fn;
  }
  return { reportError: reportError2, reportRejected: reportRejected2, reportBrowserError: reportBrowserError2, handleBrowserErrorReport: handleBrowserErrorReport2, handleErrorReportTest: handleErrorReportTest2, onRequestError: onRequestError2, watchConsole: watchConsole2, setWho: setWho2 };
}
var watchtower = createWatchtower();
var { reportError, reportRejected, reportBrowserError, handleBrowserErrorReport, handleErrorReportTest, onRequestError, watchConsole, setWho } = watchtower;

export {
  KNOWN,
  createWatchtower,
  reportError,
  reportRejected,
  reportBrowserError,
  handleBrowserErrorReport,
  handleErrorReportTest,
  onRequestError,
  watchConsole,
  setWho
};

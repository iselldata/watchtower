# watchtower

Tells you when your app breaks.

Every error, crash and refused request is written to the logs as one line you can search, and sent to a Telegram chat as a short
message you can copy and paste. The same problem is sent once and then counted, so one bug on a busy shop is a few messages and
not a flood. Nothing a customer typed is ever included: only where it happened, which field was refused and the message.

No dependencies. React is an optional peer, only for the crash screens. About 6 kB.

- **`[error]`** something unexpected broke on the server
- **`[rejected]`** a request was refused because it was invalid (the field and the message, never the value)
- **`[browser]`** a page crashed on somebody's phone or computer

Without the two Telegram keys nothing is sent and the logs still get everything, so it is safe to install first and switch on after.

---

## Install

```bash
npm i @demonbloodx2/watchtower
```

## Set up Telegram (two minutes, once for all your apps)

1. In Telegram, message **@BotFather**, send `/newbot`, choose a name and a username ending in `bot`. It gives you a **token**.
2. Open your new bot, tap **Start**, send it any message.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser. The number after `"chat":{"id":` is your **chat ID**. For a
   group it is negative, like `-4012345678`; keep the minus sign.
4. In your host (Vercel, Railway, anywhere) add two environment variables to each app:

```
TELEGRAM_BOT_TOKEN=<the token>
TELEGRAM_CHAT_ID=<the chat id>
```

One bot serves every app: each message names the app it came from. Keep the token private; anyone who has it can post as your bot.

## Next.js (App Router)

Three one-line files.

`instrumentation.ts` (at the root, next to `app/`): every unexpected server error is reported with its route.

```ts
export { onRequestError } from "@demonbloodx2/watchtower/next";
```

`app/api/report-error/route.ts`: where a crashed page sends its note, and where you can test the connection.

```ts
export { POST, GET } from "@demonbloodx2/watchtower/next";
```

`app/error.tsx` and `app/global-error.tsx`: a plain-words crash screen that sends the note.

```tsx
"use client";
import { ErrorPage } from "@demonbloodx2/watchtower/react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage error={error} reset={reset} />;
}
```

```tsx
"use client";
import { GlobalErrorPage } from "@demonbloodx2/watchtower/react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <GlobalErrorPage error={error} reset={reset} />;
}
```

Two more lines catch what the hooks above cannot:

`instrumentation.ts`, inside `register()`: many routes catch their own errors, log them with `console.error` and answer 500, which
Next counts as handled. `watchConsole()` makes any `Error` that is logged that way reach Telegram too.

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { watchConsole } = await import("@demonbloodx2/watchtower");
    watchConsole();
  }
}
```

`app/layout.tsx`, inside `<body>`: errors on the page that no error screen sees, such as a button handler that throws. It skips
browser extensions and lost connections, sends each message once, and at most five a page.

```tsx
import { WatchtowerListener } from "@demonbloodx2/watchtower/react";
// ...
<WatchtowerListener />
```

Deploy, then open `https://your-app/api/report-error?test=<your chat id>`. One message arrives in Telegram. A wrong chat id gets a
404, so a stranger cannot set it off.

If you use a custom middleware that asks people to sign in, let `/api/report-error` through.

### Make the crash screen your own

```tsx
<ErrorPage
  error={error}
  reset={reset}
  title="Oh no."
  message="We have a note of it."
  accent="#10231B"
  accentText="#ffffff"
/>
```

## Refused requests

Pass a zod error's issues straight in:

```ts
import { reportRejected } from "@demonbloodx2/watchtower";

const parsed = Schema.safeParse(body);
if (!parsed.success) {
  reportRejected("POST /api/orders", parsed.error.errors);
  return Response.json({ error: "Invalid input" }, { status: 400 });
}
```

Anything with `{ path, message }` works; it does not need zod.

## Anything else

```ts
import { reportError } from "@demonbloodx2/watchtower";

try {
  await chargeTheCard();
} catch (error) {
  reportError("charge the card", error);
  // and carry on, or rethrow
}
```

## Other apps (Express, workers, scripts)

The core needs nothing from Next:

```ts
import { createWatchtower } from "@demonbloodx2/watchtower";

const { reportError } = createWatchtower({ app: "my-api", quietMs: 10 * 60_000, perMinute: 6 });
process.on("uncaughtException", (e) => reportError("uncaught", e));
```

| Option | Default | |
|---|---|---|
| `token`, `chatId` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Without both, nothing is sent |
| `app` | the host's deployment address, else `local` | Named in every message |
| `quietMs` | 5 minutes | The same problem is sent once, then counted, and mentioned again after this |
| `perMinute` | 12 | The most messages one server sends in a minute |

On Vercel the message is sent after the response has gone, so nobody waits on Telegram. Elsewhere it is sent in the background. If
Telegram is down, the error is still in your logs.

## What a message looks like

```
REFUSED a request
shop.example.com (production) a1b2c3d
Where: POST /api/orders
Fields: whatsappNumber: String must contain at least 1 character(s)
Also happened 12 more times since the last message.
```

## Licence

MIT

import { test } from "node:test";
import assert from "node:assert/strict";
import { createWatchtower } from "../dist/index.js";

const quiet = () => {
  console.error = () => {};
  console.warn = () => {};
};

function make(options = {}) {
  const sent = [];
  const w = createWatchtower({ token: "t", chatId: "42", app: "shop.example.com", fetch: async (_url, init) => (sent.push(JSON.parse(init.body).text), new Response("{}")), ...options });
  return { w, sent };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test("a refused request names the field and never the value", async () => {
  quiet();
  const { w, sent } = make();
  w.reportRejected("POST /api/orders", [{ path: ["whatsappNumber"], message: "String must contain at least 1 character(s)" }]);
  await settle();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /REFUSED a request/);
  assert.match(sent[0], /shop\.example\.com/);
  assert.match(sent[0], /Fields: whatsappNumber: String must contain/);
});

test("the same problem is sent once and then counted", async () => {
  quiet();
  const { w, sent } = make({ quietMs: 50 });
  for (let i = 0; i < 30; i++) w.reportError("GET /a", new Error("Boom"));
  await settle();
  assert.equal(sent.length, 1);
  await new Promise((r) => setTimeout(r, 60));
  w.reportError("GET /a", new Error("Boom"));
  await settle();
  assert.equal(sent.length, 2);
  assert.match(sent[1], /Also happened 29 more times/);
});

test("no more than perMinute messages go out", async () => {
  quiet();
  const { w, sent } = make({ perMinute: 5 });
  for (let i = 0; i < 20; i++) w.reportError(`GET /r${i}`, new Error(`Different ${i}`));
  await settle();
  assert.equal(sent.length, 5);
});

test("without keys nothing is sent", async () => {
  quiet();
  const sent = [];
  const w = createWatchtower({ fetch: async (_u, init) => (sent.push(init), new Response("{}")) });
  delete process.env.TELEGRAM_BOT_TOKEN;
  w.reportError("x", new Error("silent"));
  await settle();
  assert.equal(sent.length, 0);
});

test("the browser report route trims junk and always answers 204", async () => {
  quiet();
  const { w, sent } = make();
  const big = await w.handleBrowserErrorReport(new Request("http://x/api/report-error", { method: "POST", body: "x".repeat(5000) }));
  const junk = await w.handleBrowserErrorReport(new Request("http://x/api/report-error", { method: "POST", body: "not json" }));
  const real = await w.handleBrowserErrorReport(new Request("http://x/api/report-error", { method: "POST", headers: { "user-agent": "Pixel" }, body: JSON.stringify({ where: "/start", message: "Crash" }) }));
  await settle();
  assert.deepEqual([big.status, junk.status, real.status], [204, 204, 204]);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /CRASH on a phone/);
  assert.match(sent[0], /Device: Pixel/);
});

test("the test page needs the chat id", async () => {
  const { w, sent } = make();
  assert.equal((await w.handleErrorReportTest(new Request("http://x/api/report-error?test=nope"))).status, 404);
  assert.equal((await w.handleErrorReportTest(new Request("http://x/api/report-error?test=42"))).status, 200);
  assert.equal(sent.length, 1);
});

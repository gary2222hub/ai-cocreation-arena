import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: {
        prepare() {
          return {
            bind() { return this; },
            async first() { return null; },
          };
        },
        async batch() { return []; },
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the activity creation experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AI 共创场<\/title>/i);
  assert.match(html, /让每一次共创/);
  assert.match(html, /AI Prompt 挑战赛/);
  assert.match(html, /空白共创/);
  assert.match(html, /3–12 人/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("serves a public health check without exposing runtime secrets", async () => {
  const response = await render("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "ai-cocreation-arena",
  });
});

import { DurableObject } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createApplication } from "../../server/application.js";
import { RoomStore } from "./room-store.js";

export class PokerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      // This deployment is explicitly PLAY only; it cannot activate payment rails.
      this.app = await createApplication({
        listen: false, background: false,
        env: {
          ...env, NODE_ENV: "production", REAL_MONEY_ENABLED: "false",
          WITHDRAWALS_ENABLED: "false", DATABASE_URL: "", REDIS_URL: "",
          SENTRY_DSN: "", TELEGRAM_AUTO_CONFIGURE: "false",
          RUNTIME_STORAGE: "durable-object-sqlite",
          TON_PAYMENTS_ENABLED: "false", TON_POLLING_ENABLED: "false",
          USDT_TRC20_PAYMENTS_ENABLED: "false", ADMIN_DAILY_REPORT_ENABLED: "false",
          ADMIN_TELEGRAM_EVENT_TYPES: "none"
        }
      });
      this.app.restore(await this.store.load());
      this.handler = httpServerHandler(this.app.server);
    });
  }

  async fetch(request) {
    await this.ready;
    // Serialize complete mutations, including persistence, before the next request.
    return this.ctx.blockConcurrencyWhile(async () => {
      await this.app.tick();
      const response = await this.handler.fetch(request);
      const streaming = response.headers.get("content-type")?.startsWith("text/event-stream");
      // Node headers can arrive before the route has finished. Drain JSON responses
      // before snapshotting, and release them only after the durable write commits.
      const body = streaming ? response.body : await response.arrayBuffer();
      await this.store.save(this.app.snapshot(), this.app.nextWakeAt());
      return new Response(body, response);
    });
  }

  async alarm() {
    await this.ready;
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.app.tick();
      await this.store.save(this.app.snapshot(), this.app.nextWakeAt());
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/source") {
      return Response.redirect(`https://github.com/justxbae/qwz-poker/tree/${env.BUILD_COMMIT || "codex/cloudflare-production"}`, 302);
    }
    if (url.pathname.startsWith("/api/") || url.pathname === "/tonconnect-manifest.json") {
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "unknown");
      headers.set("x-forwarded-proto", "https");
      return env.POKER_ROOM.getByName("weez-room-v1").fetch(new Request(request, { headers }));
    }
    if (url.pathname === "/terms") url.pathname = "/terms.html";
    if (url.pathname === "/privacy") url.pathname = "/privacy.html";
    if (url.pathname === "/admin") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    headers.set("x-xss-protection", "0");
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    if (url.pathname === "/brand.png") headers.set("access-control-allow-origin", "*");
    return new Response(response.body, { status: response.status, headers });
  }
};

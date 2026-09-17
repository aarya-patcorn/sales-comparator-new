import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";

type HyperdriveBinding = {
  connectionString: string;
};

type WorkerBindings = Record<string, unknown> & {
  HYPERDRIVE: HyperdriveBinding;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type WorkerHandler = {
  fetch(
    request: Request,
    bindings: WorkerBindings,
    ctx: WorkerExecutionContext,
  ): Response | Promise<Response>;
  scheduled?(
    controller: { cron: string; scheduledTime: number },
    bindings: WorkerBindings,
    ctx: WorkerExecutionContext,
  ): void | Promise<void>;
};

type NodeHttpHandler = {
  fetch(
    request: Request,
    env: WorkerBindings,
    ctx: WorkerExecutionContext,
  ): Response | Promise<Response>;
};

let startup: Promise<void> | undefined;
let handler: NodeHttpHandler | undefined;

/**
 * Existing modules read process.env during evaluation. Copy scalar bindings
 * before importing them, and always prefer Hyperdrive over a direct URL.
 */
function applyBindings(bindings: WorkerBindings): void {
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") process.env[key] = value;
  }
  process.env.DATABASE_URL = bindings.HYPERDRIVE.connectionString;
}

async function initialize(bindings: WorkerBindings): Promise<void> {
  applyBindings(bindings);

  const { app } = await import("./app.js");
  const server = createServer(app);
  handler = httpServerHandler(server) as unknown as NodeHttpHandler;
}

function ensureInitialized(bindings: WorkerBindings): Promise<void> {
  startup ??= initialize(bindings);
  return startup;
}

export default {
  async fetch(
    request: Request,
    bindings: WorkerBindings,
    ctx: WorkerExecutionContext,
  ): Promise<Response> {
    await ensureInitialized(bindings);
    if (!handler) throw new Error("Worker HTTP handler did not initialize");
    return handler.fetch(request, bindings, ctx);
  },

  async scheduled(
    _controller: { cron: string; scheduledTime: number },
    bindings: WorkerBindings,
    ctx: WorkerExecutionContext,
  ): Promise<void> {
    await ensureInitialized(bindings);
    const { runSessionCleanup } = await import("./jobs/sessionCleanup.js");
    ctx.waitUntil(runSessionCleanup());
  },
} satisfies WorkerHandler;

import { app } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./db/client.js";
import { startSessionCleanup } from "./jobs/sessionCleanup.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, env.HOST, () => {
  const address = server.address();
  const bound =
    typeof address === "string"
      ? address
      : `http://${address?.address}:${address?.port}`;

  logger.info(
    { host: env.HOST, port: env.PORT, env: env.NODE_ENV },
    `Server listening on ${bound}`,
  );
});

const sessionCleanup = startSessionCleanup();

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "Shutting down");

  void sessionCleanup?.stop();

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }

    disconnectPrisma()
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, "Error disconnecting Prisma");
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

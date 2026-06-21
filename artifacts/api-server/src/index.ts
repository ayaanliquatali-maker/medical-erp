import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed";
import http from "http";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function verifyDatabaseConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    client.release();
    logger.info("Database connection verified");
  } catch (err) {
    logger.error({ err }, "Database connection failed at startup");
    throw err;
  }
}

async function start(): Promise<void> {
  await verifyDatabaseConnection();

  const server = http.createServer(app);

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    seedDatabase().catch(err => logger.error({ err }, "Seed error"));
  });

  function gracefulShutdown(signal: string) {
    logger.info({ signal }, "Received shutdown signal");
    server.close(() => {
      logger.info("HTTP server closed");
      pool.end().then(() => {
        logger.info("Database pool drained");
        process.exit(0);
      }).catch((err) => {
        logger.error({ err }, "Error draining database pool");
        process.exit(1);
      });
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

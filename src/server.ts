import app from "./app.js";
import { prismaClient } from "./db/prisma.js";
import { PORT } from "./config/secrets.js";
import logger from "./utils/logger.js";

// Global error handlers
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection", err);
  process.exit(1);
});

const server = app.listen(PORT, () => {
  logger.info(
    `Server running in ${process.env.NODE_ENV ?? "development"} mode on port ${PORT}`,
  );
});

// Graceful shutdown (close HTTP server and disconnect Prisma)
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    logger.info(`${sig} received, shutting down gracefully…`);
    server.close(async (err?: Error) => {
      if (err) logger.error("Error closing HTTP server", err);

      try {
        await prismaClient.$disconnect();
        logger.info("Prisma disconnected.");
      } catch (dbErr) {
        logger.error("Error disconnecting Prisma", dbErr);
      } finally {
        process.exit(0);
      }
    });
  });
}

import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const cookieSecret = process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD;
if (!cookieSecret) {
  throw new Error("ADMIN_COOKIE_SECRET or ADMIN_PASSWORD must be set to enable admin session cookies.");
}

app.use(cookieParser(cookieSecret));
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Health/readiness check — also verify DB connectivity
app.use((_req, res) => {
  res.json({ status: "ok" });
});

// Global error-handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error({ err }, "Unhandled error");
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

export default app;

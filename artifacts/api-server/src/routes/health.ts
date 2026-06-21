import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get(["/healthz", "/health"], async (_req, res) => {
  try {
    const client = await pool.connect();
    client.release();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

export default router;

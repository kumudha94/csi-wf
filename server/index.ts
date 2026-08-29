import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { registerRoutes } from "./routes/index";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const app = express();

// Auth is bearer-token, not cookie/session-based, so there's no ambient
// credential a cross-origin page could ride on — allowing any origin is
// safe here and needed since the mobile app has no origin at all.
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues.map((issue) => issue.message).join("; ") });
      return;
    }
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error(err);
      res.status(status).json({ error: "Internal Server Error" });
      return;
    }
    res.status(status).json({ error: err.message || "Bad Request" });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0" }, () => {
    console.log(`CSI-WF API listening on port ${port}`);
  });
})();

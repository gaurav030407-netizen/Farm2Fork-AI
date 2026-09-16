import express, { type Express, type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
const frontendOrigins = (process.env.FRONTEND_ORIGINS ?? "http://localhost:5000,http://127.0.0.1:5000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        frontendOrigins.includes(origin) ||
        origin.endsWith(".netlify.app") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  request.log?.error({ err: error, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, "Unhandled API error");
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "AUTH_SERVICE_UNAVAILABLE";
  if (code === "42P01") {
    response.status(500).json({ detail: "OTP database migrations are not applied. Run migrations 017, 018, and 019.", code: "DATABASE_SCHEMA_MISSING" });
    return;
  }
  const detail = error instanceof Error ? error.message : "Authentication service is temporarily unavailable.";
  response.status(500).json({ detail, code: "AUTH_SERVICE_UNAVAILABLE" });
});

export default app;

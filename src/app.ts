import express, { Application, NextFunction, Request, Response } from "express";
import { ALLOWED_ORIGIN, NODE_ENV, TRUST_PROXY } from "./config/secrets.js";
import rootRouter from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cookieParser from "cookie-parser";

const app: Application = express();

const trustProxy = TRUST_PROXY;
if (typeof trustProxy !== "undefined") {
  if (trustProxy === "1") {
    app.set("trust proxy", 1);
  } else if (trustProxy === "true") {
    app.set("trust proxy", true);
  } else {
    app.set("trust proxy", trustProxy);
  }
} else if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:", "res.cloudinary.com"],
        "connect-src": [
          "'self'",
          ALLOWED_ORIGIN ?? "'self'",
          "res.cloudinary.com",
          "ws:",
          "wss:",
        ],
      },
    },
  }),
);
app.use(hpp());
app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN,
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    credentials: ALLOWED_ORIGIN !== "*",
    exposedHeaders: ["Content-Disposition"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1", rootRouter);

app.use(notFound);

app.use(
  errorHandler as (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void,
);

export default app;

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";

dotenv.config();

export const app = express();

const explicitAllowedOrigins = [
  ...(process.env.CLIENT_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  process.env.CLIENT_URL?.trim() || "",
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ""));

const allowVercelPreviews =
  (process.env.ALLOW_VERCEL_PREVIEWS || "true").toLowerCase() === "true";

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, "");
      if (explicitAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      if (allowVercelPreviews) {
        try {
          const hostname = new URL(normalizedOrigin).hostname;
          if (hostname.endsWith(".vercel.app")) {
            return callback(null, true);
          }
        } catch {
          // Ignora origem malformada e cai no bloqueio abaixo.
        }
      }

      return callback(new Error("Origem nao permitida por CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

export { getScopeContext, getBusinessFilter, blockWriteInGeneralScope } from "./middleware/scope";


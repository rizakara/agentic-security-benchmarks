import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import cartRoutes from "./routes/cart.js";
import checkoutRoutes from "./routes/checkout.js";
import adminRoutes from "./routes/admin.js";
import webhookRoutes from "./routes/webhooks.js";

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === "production";

// --- Security headers ---
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);

// --- CORS with explicit origin whitelist ---
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// --- Webhook route needs raw body BEFORE json parser ---
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

// --- Body parsing for all other routes ---
app.use(express.json({ limit: "1mb" }));

// --- Logging ---
app.use(morgan(isProduction ? "combined" : "dev"));

// --- Enforce HTTPS in production ---
if (isProduction) {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// --- Static file serving (uploads only, with safe headers) ---
app.use(
  "/static",
  express.static(process.env.UPLOAD_DIR || "./uploads", {
    dotfiles: "deny",
    index: false,
    setHeaders(res) {
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Disposition", "attachment");
    },
  })
);

// --- Routes ---
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/admin", adminRoutes);

// --- Health check ---
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// --- 404 ---
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// --- Error handler ---
app.use(errorHandler);

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export default app;

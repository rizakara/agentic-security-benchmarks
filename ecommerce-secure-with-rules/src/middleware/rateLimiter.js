import redis from "../config/redis.js";

/**
 * Dual-layer rate limiter using Redis.
 * @param {{ windowSec: number, maxRequests: number, prefix: string }} opts
 */
export function rateLimit({ windowSec = 60, maxRequests = 10, prefix = "rl" }) {
  return async (req, res, next) => {
    const ip = req.ip;
    const userId = req.user?.id;
    const keys = [`${prefix}:ip:${ip}`];
    if (userId) keys.push(`${prefix}:user:${userId}`);

    for (const key of keys) {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }
      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        res.set("Retry-After", String(ttl > 0 ? ttl : windowSec));
        return res.status(429).json({ error: "Too many requests" });
      }
    }
    next();
  };
}

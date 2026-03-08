import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redis.on("error", (err) => {
  console.error("Redis connection error", err.message);
});

export default redis;

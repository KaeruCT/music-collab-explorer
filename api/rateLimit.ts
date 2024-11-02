import { Context } from "@oak/oak";

const requestTimestamps = new Map<string, number[]>();
const RATE_LIMIT_MS = 500;
const MAX_REQUESTS = 10;

export async function rateLimit(ctx: Context, next: () => Promise<unknown>) {
  const userIdentifier = ctx.request.ip;

  const now = Date.now();
  const timestamps = requestTimestamps.get(userIdentifier) || [];

  // Remove timestamps that are outside of the RATE_LIMIT_MS window
  const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_MS);

  // Check if the request count within the time window exceeds the limit
  if (recentTimestamps.length >= MAX_REQUESTS) {
    ctx.response.status = 429;
    ctx.response.body = { error: "Too many requests. Please wait before trying again." };
    return;
  }

  // Add the current request timestamp and update the map
  recentTimestamps.push(now);
  requestTimestamps.set(userIdentifier, recentTimestamps);

  await next();
}

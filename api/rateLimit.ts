import { Context } from "@oak/oak";

const requestTimestamps = new Map<string, number>();
const RATE_LIMIT_MS = 500;

export async function rateLimit(ctx: Context, next: () => Promise<unknown>) {
  const userIdentifier = ctx.request.ip;

  const now = Date.now();
  const lastRequest = requestTimestamps.get(userIdentifier);

  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    ctx.response.status = 429;
    ctx.response.body = { error: "Too many requests. Please wait before trying again." };
    return;
  }

  requestTimestamps.set(userIdentifier, now);

  await next();
}

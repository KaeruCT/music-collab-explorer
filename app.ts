import { Application, send } from "oak";
import { router } from "./routes/api.ts";
import "dotenv";

const app = new Application();

app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/") {
    await send(ctx, "public/index.html");
  } else {
    await next();
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";
const port = Deno.env.get("PORT") || "8000";

console.log(`Server running on http://${hostname}:${port}`);
await app.listen({ port: Number(port), hostname });

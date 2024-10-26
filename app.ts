import { Application, send } from "oak";
import { router } from "./routes/api.ts";

const app = new Application();

app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/") {
    await send(ctx, "public/index.html");
  } else {
    await next();
  }
});

app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

console.log("Server running on http://localhost:8000");
await app.listen({ port: 8000 });

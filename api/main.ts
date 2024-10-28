import "@std/dotenv/load";

import { Application } from "@oak/oak";
import { oakCors } from "@tajpouria/cors";
import { router } from "./router.ts";
import routeStaticFilesFrom from "./routeStaticFilesFrom.ts";
import { rateLimit } from "./rateLimit.ts";

const app = new Application();

app.use(oakCors());
app.use(rateLimit);
app.use(router.routes());
app.use(router.allowedMethods());
app.use(routeStaticFilesFrom([
  `${Deno.cwd()}/dist`,
  `${Deno.cwd()}/public`,
]));

const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";
const port = Deno.env.get("PORT") || "8000";

console.log(`Server running on http://${hostname}:${port}`);
await app.listen({ port: Number(port), hostname });

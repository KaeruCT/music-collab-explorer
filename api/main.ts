import "@std/dotenv/load";

import { Application } from "@oak/oak";
import { oakCors } from "@tajpouria/cors";
import { router } from "./router.ts";
import routeStaticFilesFrom from "./routeStaticFilesFrom.ts";

const app = new Application();

app.use(oakCors());
app.use(router.routes());
app.use(router.allowedMethods());

const staticPath = `${Deno.cwd()}/dist`;
app.use(routeStaticFilesFrom([staticPath]));

const hostname = Deno.env.get("HOSTNAME") || "0.0.0.0";
const port = Deno.env.get("PORT") || "8000";

console.log(`Server running on http://${hostname}:${port}`);
console.log(`Static files served from ${staticPath}`);
await app.listen({ port: Number(port), hostname });

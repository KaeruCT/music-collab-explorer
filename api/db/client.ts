import { Pool } from "postgres";

const POOL_SIZE = 10;

// Access environment variables
const dbHost = Deno.env.get("DB_HOST") || "localhost";
const dbUser = Deno.env.get("DB_USER") || "musicbrainz";
const dbPassword = Deno.env.get("DB_PASSWORD") || "musicbrainz";
const dbName = Deno.env.get("DB_NAME") || "musicbrainz";
const dbPort = Deno.env.get("DB_PORT") || "15432";
const enforceTls = Boolean(Deno.env.get("ENFORCE_TLS")) || false;

const pool = new Pool({
  user: dbUser,
  password: dbPassword,
  database: dbName,
  hostname: dbHost,
  port: Number(dbPort),
  tls: { enforce: enforceTls },
}, POOL_SIZE);

export default pool;

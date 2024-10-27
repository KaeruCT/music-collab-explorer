import { Pool } from "postgres";
import "dotenv";

const POOL_SIZE = 10;

// Import dotenv to load environment variables
import "https://deno.land/x/dotenv@v3.2.0/load.ts";

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

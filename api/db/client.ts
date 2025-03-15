import { Pool } from "postgres";

const POOL_SIZE = 10;

const dbHost = Deno.env.get("DB_HOST") || "localhost";
const dbUser = Deno.env.get("DB_USER") || "musicbrainz";
const dbPassword = Deno.env.get("DB_PASSWORD") || "musicbrainz";
const dbName = Deno.env.get("DB_NAME") || "musicbrainz";
const dbPort = Deno.env.get("DB_PORT") || "5432";
const enforceTls = Boolean(Deno.env.get("ENFORCE_TLS")) || false;

console.info(`Database: ${dbHost}:${dbPort}...`);
console.info(`Database user: ${dbUser}`);
console.info(`Database name: ${dbName}`);
console.info(`Enforce TLS: ${enforceTls}`);

let pool: Pool;

export function getPool() {
  if (!pool) {
    try {
      pool = new Pool({
        user: dbUser,
        password: dbPassword,
        database: dbName,
        hostname: dbHost,
        port: Number(dbPort),
        tls: { enforce: enforceTls },
        options: "-c search_path=musicbrainz,public",
      }, POOL_SIZE);
    } catch (error) {
      console.error("Failed to connect to the database");
      throw error;
    }
  }
  return pool;
};

export function getClient() {
  try {
    return getPool().connect();
  } catch (error) {
    console.error("Failed to connect to the database");
    throw error;
  }
}

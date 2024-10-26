import { Pool } from "postgres";

const POOL_SIZE = 10;

const pool = new Pool({
  user: "musicbrainz",
  password: "musicbrainz",
  database: "musicbrainz",
  hostname: "localhost",
  port: 15432,
}, POOL_SIZE);

export default pool;

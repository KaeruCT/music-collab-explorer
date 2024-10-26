import { Pool } from "postgres";

const POOL_SIZE = 10;

const pool = new Pool({
  user: "user",
  password: "password",
  database: "dbname",
  hostname: "localhost",
  port: 5432,
}, POOL_SIZE);

export default pool;

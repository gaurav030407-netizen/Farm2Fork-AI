import { resolve } from "node:path";
process.loadEnvFile(resolve(import.meta.dirname, ".env"));

const { pool, hashPassword } = await import("./src/auth.ts");
const client = await pool.connect();
try {
  console.log("Connected to pool.");
  const res = await client.query("SELECT id, name, email, role FROM public.profiles WHERE role = 'ADMIN'");
  console.log("Admin profiles found:", res.rows);

  console.log("Testing security_audit_events table...");
  const auditRes = await client.query("SELECT count(*) FROM public.security_audit_events");
  console.log("Audit table count:", auditRes.rows[0]);
} catch (err) {
  console.error("Database query error:", err);
} finally {
  client.release();
  await pool.end();
  process.exit(0);
}

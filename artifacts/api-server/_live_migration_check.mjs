import { readFile } from "node:fs/promises";
import pg from "pg";

process.loadEnvFile(new URL("./.env", import.meta.url));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function hasColumns(columns) {
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = ANY($1::text[])",
    [columns],
  );
  return result.rowCount === columns.length;
}

async function tableExists(tableName) {
  const result = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
    [tableName],
  );
  return result.rows[0].exists;
}

async function columnIsNullable(tableName, columnName) {
  const result = await pool.query(
    "SELECT is_nullable = 'YES' AS nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [tableName, columnName],
  );
  return result.rows[0]?.nullable === true;
}

async function applyMigration(path) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(new URL(path, import.meta.url), "utf8"));
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error(`migration failed (${path}): ${err?.message}`);
  } finally {
    client.release();
  }
}

try {
  const foreignKey = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass) AS exists",
  );
  const migration002Applied = await hasColumns(["email", "password_hash"])
    && !foreignKey.rows[0].exists;
  if (migration002Applied) {
    console.log("migration-002=already-applied");
  } else {
    await applyMigration("../../backend/migrations/002_node_jwt_auth.sql");
    console.log("migration-002=applied");
  }

  const otpColumns = [
    "email_verified",
    "email_otp_hash",
    "email_otp_expires_at",
    "email_otp_attempts",
    "email_otp_last_sent_at",
  ];
  if (await hasColumns(otpColumns)) {
    console.log("migration-003=already-applied");
  } else {
    await applyMigration("../../backend/migrations/003_email_otp_verification.sql");
    console.log("migration-003=applied");
  }

  const pendingTable = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pending_registrations') AS exists",
  );
  if (pendingTable.rows[0].exists) {
    console.log("migration-004=already-applied");
  } else {
    await applyMigration("../../backend/migrations/004_pending_email_registrations.sql");
    console.log("migration-004=applied");
  }

  const legacyUnverified = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('FARMER', 'BUYER') AND email_verified IS NOT TRUE) AS exists",
  );
  if (legacyUnverified.rows[0].exists) {
    await applyMigration("../../backend/migrations/005_move_legacy_unverified_profiles_to_pending.sql");
    console.log("migration-005=applied");
  } else {
    console.log("migration-005=already-applied");
  }

  if (!await tableExists("conversations")) {
    await applyMigration("../../backend/migrations/008_messages.sql");
    console.log("migration-008=applied");
  } else {
    console.log("migration-008=already-applied");
  }

  if (await columnIsNullable("conversations", "order_id") && await columnIsNullable("messages", "order_id") && await tableExists("notifications")) {
    console.log("migration-009=already-applied");
  } else {
    await applyMigration("../../backend/migrations/009_pre_order_messaging_notifications.sql");
    console.log("migration-009=applied");
  }

  if (await tableExists("identity_verifications") && await hasColumns(["email", "password_hash", "profile_photo_path", "bio", "city", "state"])) {
    console.log("migration-010=already-applied");
  } else {
    await applyMigration("../../backend/migrations/010_profiles_identity_verification.sql");
    console.log("migration-010=applied");
  }

  const locationColumns = await pool.query(
    "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = ANY($1::text[])",
    [["address", "locality", "landmark", "pin_code", "latitude", "longitude"]],
  );
  if (locationColumns.rows[0].count === 6) {
    console.log("migration-011=already-applied");
  } else {
    await applyMigration("../../backend/migrations/011_profile_locations_and_farm_details.sql");
    console.log("migration-011=applied");
  }

  const consumerRole = await pool.query("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check' AND pg_get_constraintdef(oid) LIKE '%CONSUMER%') AS exists");
  if (consumerRole.rows[0].exists) {
    console.log("migration-012=already-applied");
  } else {
    await applyMigration("../../backend/migrations/012_consumer_role.sql");
    console.log("migration-012=applied");
  }

  if (await tableExists("market_data_sources")) {
    console.log("migration-013=already-applied");
  } else {
    await applyMigration("../../backend/migrations/013_market_intelligence.sql");
    console.log("migration-013=applied");
  }

  if (await tableExists("crops") && await tableExists("crop_listing_media")) {
    console.log("migration-014=already-applied");
  } else {
    await applyMigration("../../backend/migrations/014_crop_catalog_marketplace_media.sql");
    console.log("migration-014=applied");
  }

  if (await tableExists("market_sync_status")) {
    console.log("migration-015=already-applied");
  } else {
    await applyMigration("../../backend/migrations/015_market_sync_status.sql");
    console.log("migration-015=applied");
  }

  const indexExists = await pool.query("SELECT to_regclass('public.market_prices_commodity_idx') AS exists");
  if (indexExists.rows[0].exists) {
    console.log("migration-016=already-applied");
  } else {
    await applyMigration("../../backend/migrations/016_market_crop_variety_indexes.sql");
    console.log("migration-016=applied");
  }

  if (await tableExists("drivers") && await tableExists("payments") && await tableExists("delivery_jobs")) {
    console.log("migration-017=already-applied");
  } else {
    await applyMigration("../../backend/migrations/017_driver_payments_contact_verification.sql");
    console.log("migration-017=applied");
  }

  if (await tableExists("auth_otp_challenges") && await tableExists("security_audit_events")) {
    console.log("migration-018=already-applied");
  } else {
    await applyMigration("../../backend/migrations/018_otp_contact_audit.sql");
    console.log("migration-018=applied");
  }

  if (await tableExists("contact_change_challenges")) {
    console.log("migration-019=already-applied");
  } else {
    await applyMigration("../../backend/migrations/019_contact_change.sql");
    console.log("migration-019=applied");
  }

  if (await hasColumns(["account_status", "deleted_at"])) {
    console.log("migration-020=already-applied");
  } else {
    await applyMigration("../../backend/migrations/020_account_deletion_admin_controls.sql");
    console.log("migration-020=applied");
  }

  const mediaModerationCol = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crop_listing_media' AND column_name = 'moderation_status') AS exists",
  );
  if (mediaModerationCol.rows[0].exists) {
    console.log("migration-021=already-applied");
  } else {
    await applyMigration("../../backend/migrations/021_admin_enhancements.sql");
    console.log("migration-021=applied");
  }
} catch (err) {
  console.log("migration-check=failed", err?.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

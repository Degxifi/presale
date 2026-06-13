-- Small table at launch, so a brief build lock is negligible. On a large table,
-- create this out-of-band first with CONCURRENTLY (outside a tx); IF NOT EXISTS
-- then makes this migration a no-op.
CREATE INDEX IF NOT EXISTS "contributions_status_tier_idx" ON "contributions" USING btree ("status","tier");
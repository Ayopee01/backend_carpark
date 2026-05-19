CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "user_agent" TEXT,
  "ip_address" TEXT,
  "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE INDEX "auth_sessions_idle_expires_at_idx" ON "auth_sessions"("idle_expires_at");

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

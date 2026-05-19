CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "password_hash" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "role" TEXT NOT NULL DEFAULT 'staff',
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
  "id" TEXT NOT NULL,
  "bill_no" TEXT NOT NULL,
  "plate_no" TEXT NOT NULL,
  "vehicle_type" TEXT NOT NULL,
  "service_type" TEXT NOT NULL,
  "entry_at" TIMESTAMPTZ(6),
  "exit_at" TIMESTAMPTZ(6),
  "exit_time_limit" TIMESTAMPTZ(6),
  "duration_minute" INTEGER,
  "amount" DECIMAL NOT NULL DEFAULT 0,
  "vat" DECIMAL NOT NULL DEFAULT 0,
  "discount" DECIMAL NOT NULL DEFAULT 0,
  "net_amount" DECIMAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payment" JSONB NOT NULL DEFAULT '{}',
  "payments" JSONB NOT NULL DEFAULT '[]',
  "total_paid" DECIMAL NOT NULL DEFAULT 0,
  "receipt" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_config" (
  "key" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "transactions_bill_no_idx" ON "transactions"("bill_no");
CREATE INDEX "transactions_plate_no_idx" ON "transactions"("plate_no");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_entry_at_idx" ON "transactions"("entry_at");
CREATE INDEX "transactions_updated_at_idx" ON "transactions"("updated_at");

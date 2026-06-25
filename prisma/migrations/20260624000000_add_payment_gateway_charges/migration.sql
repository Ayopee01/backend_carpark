CREATE TABLE "payment_gateway_charges" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'omise',
  "charge_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "plate_no" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "paid_at" TIMESTAMPTZ(6),
  "processed_at" TIMESTAMPTZ(6),
  "raw" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "payment_gateway_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_charges_charge_id_key" ON "payment_gateway_charges"("charge_id");
CREATE INDEX "payment_gateway_charges_transaction_id_idx" ON "payment_gateway_charges"("transaction_id");
CREATE INDEX "payment_gateway_charges_plate_no_idx" ON "payment_gateway_charges"("plate_no");
CREATE INDEX "payment_gateway_charges_status_idx" ON "payment_gateway_charges"("status");

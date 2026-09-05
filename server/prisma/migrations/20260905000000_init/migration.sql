-- Kamdhenu Sales Comparator — initial schema.
-- Translation of REBUILD_BLUEPRINT §2.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "spec_source" AS ENUM ('tds_ai', 'manual');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('rm', 'admin');

-- CreateTable
CREATE TABLE "substrates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substrates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tile_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tile_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tile_type_sizes" (
    "id" BIGSERIAL NOT NULL,
    "tile_type_id" TEXT NOT NULL,
    "size_label" TEXT NOT NULL,

    CONSTRAINT "tile_type_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substrate_tile_map" (
    "substrate_id" TEXT NOT NULL,
    "tile_type_id" TEXT NOT NULL,

    CONSTRAINT "substrate_tile_map_pkey" PRIMARY KEY ("substrate_id","tile_type_id")
);

-- CreateTable
CREATE TABLE "application_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "application_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "en_classification" TEXT,
    "application_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technical_params" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competitor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "en_classification" TEXT,
    "technical_params" JSONB NOT NULL DEFAULT '{}',
    "spec_source" "spec_source" NOT NULL,
    "tds_file_url" TEXT,
    "tds_file_name" TEXT,
    "ai_raw_extraction" JSONB,
    "ai_model" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "user_role" NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "mobile_number" TEXT,
    "google_sub" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pitch_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cache_key" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "pitch_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cache_key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "recommendation_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tile_type_sizes_tile_type_id_size_label_key" ON "tile_type_sizes"("tile_type_id", "size_label");

-- CreateIndex
CREATE INDEX "idx_products_params" ON "products" USING GIN ("technical_params" jsonb_ops);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_mobile" ON "users"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_google_sub" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sessions_hash" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_expiry" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pitch_cache_key" ON "pitch_cache"("cache_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reco_cache_key" ON "recommendation_cache"("cache_key");

-- AddForeignKey
ALTER TABLE "tile_type_sizes" ADD CONSTRAINT "tile_type_sizes_tile_type_id_fkey" FOREIGN KEY ("tile_type_id") REFERENCES "tile_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "substrate_tile_map" ADD CONSTRAINT "substrate_tile_map_substrate_id_fkey" FOREIGN KEY ("substrate_id") REFERENCES "substrates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "substrate_tile_map" ADD CONSTRAINT "substrate_tile_map_tile_type_id_fkey" FOREIGN KEY ("tile_type_id") REFERENCES "tile_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competitor_products" ADD CONSTRAINT "competitor_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ============================================================================
-- Raw SQL: constraints the Prisma schema language cannot express.
-- Keep this block in sync with prisma/schema.prisma comments.
-- ============================================================================

-- Prisma does not emit NOT NULL for scalar list columns; the DDL requires it.
ALTER TABLE "products" ALTER COLUMN "application_areas" SET NOT NULL;

-- Partial unique indexes: one live row per business key, ignoring soft-deleted rows.
CREATE UNIQUE INDEX "uq_products_code_active"
  ON "products" ("code") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_competitors_slug_active"
  ON "competitors" ("slug") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_comp_products_name_active"
  ON "competitor_products" ("competitor_id", "name") WHERE "deleted_at" IS NULL;

-- Admin emails are unique; RM rows may repeat/omit email.
CREATE UNIQUE INDEX "uq_users_email"
  ON "users" ("email") WHERE "email" IS NOT NULL AND "role" = 'admin';

-- An AI-sourced competitor product must have a stored file reference.
ALTER TABLE "competitor_products"
  ADD CONSTRAINT "chk_tds_file"
  CHECK ("spec_source" <> 'tds_ai' OR "tds_file_url" IS NOT NULL);

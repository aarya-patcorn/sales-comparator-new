ALTER TABLE "products"
    ADD COLUMN "tagline" TEXT,
    ADD COLUMN "is_type" TEXT,
    ADD COLUMN "max_tile_size" TEXT;

ALTER TABLE "competitor_products"
    ADD COLUMN "is_type" TEXT;

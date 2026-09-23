-- Store the catalogue combinations each product is approved to recommend for.
ALTER TABLE "products"
    ADD COLUMN "substrate_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "tile_type_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "tile_sizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

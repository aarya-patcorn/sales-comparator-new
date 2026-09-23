ALTER TABLE "products"
ADD COLUMN "installation_suitability" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

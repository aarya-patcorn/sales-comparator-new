import { env } from "../config/env.js";
import { prisma, disconnectPrisma } from "./client.js";
import { logger } from "../lib/logger.js";
import { emptyParams } from "../validation/technicalParams.js";
import type { TechnicalParams } from "../validation/technicalParams.js";

// ============================================================ catalog: substrates

type SubstrateSeed = { id: string; name: string };

const SUBSTRATES: readonly SubstrateSeed[] = [
  { id: "concrete", name: "Concrete" },
  { id: "cement_plaster", name: "Cement Plaster" },
  { id: "cement_screed", name: "Cement Screed" },
  { id: "brick_masonry", name: "Brick Masonry" },
  { id: "aac_block", name: "AAC Block" },
  { id: "gypsum_plaster", name: "Gypsum Plaster" },
  { id: "gypsum_board", name: "Gypsum Board" },
  { id: "cement_board", name: "Cement Board" },
  { id: "plywood", name: "Plywood" },
  { id: "existing_tile", name: "Existing Tile" },
  { id: "marble_granite", name: "Marble / Granite" },
  { id: "metal", name: "Metal" },
  { id: "waterproofing_membrane", name: "Waterproofing Membrane" },
  { id: "swimming_pool_shell", name: "Swimming Pool Shell" },
  { id: "glass", name: "Glass" },
];

// ============================================================ catalog: tile types

type TileTypeSeed = {
  id: string;
  name: string;
  category: string | null;
  sizes: readonly string[];
};

const TILE_TYPES: readonly TileTypeSeed[] = [
  {
    id: "vitrified",
    name: "Vitrified",
    category: "porcelain",
    sizes: ["12 x 12 in", "24 x 24 in", "24 x 48 in"],
  },
  {
    id: "double_charge_vitrified",
    name: "Double Charge Vitrified",
    category: "porcelain",
    sizes: ["24 x 24 in", "32 x 32 in"],
  },
  {
    id: "full_body_vitrified",
    name: "Full Body Vitrified",
    category: "porcelain",
    sizes: ["24 x 24 in", "24 x 48 in"],
  },
  {
    id: "glazed_vitrified",
    name: "Glazed Vitrified",
    category: "porcelain",
    sizes: ["16 x 16 in", "24 x 24 in", "24 x 48 in"],
  },
  {
    id: "porcelain",
    name: "Porcelain",
    category: "porcelain",
    sizes: ["12 x 24 in", "24 x 24 in"],
  },
  {
    id: "ceramic_wall",
    name: "Ceramic Wall Tile",
    category: "ceramic",
    sizes: ["8 x 12 in", "12 x 18 in", "12 x 24 in"],
  },
  {
    id: "ceramic_floor",
    name: "Ceramic Floor Tile",
    category: "ceramic",
    sizes: ["12 x 12 in", "16 x 16 in"],
  },
  {
    id: "terracotta",
    name: "Terracotta",
    category: "ceramic",
    sizes: ["8 x 8 in", "12 x 12 in"],
  },
  {
    id: "mosaic",
    name: "Mosaic",
    category: "ceramic",
    sizes: ["12 x 12 in sheet"],
  },
  {
    id: "glass_mosaic",
    name: "Glass Mosaic",
    category: "glass",
    sizes: ["12 x 12 in sheet"],
  },
  {
    id: "marble",
    name: "Marble",
    category: "natural_stone",
    sizes: ["24 x 24 in", "24 x 48 in", "Slab"],
  },
  {
    id: "granite",
    name: "Granite",
    category: "natural_stone",
    sizes: ["24 x 24 in", "Slab"],
  },
  {
    id: "natural_stone",
    name: "Natural Stone",
    category: "natural_stone",
    sizes: ["12 x 12 in", "24 x 24 in", "Random"],
  },
  {
    id: "large_format_slab",
    name: "Large Format Slab",
    category: "porcelain",
    sizes: ["48 x 96 in", "63 x 126 in"],
  },
];

/** substrate id -> tile type ids offered for it. */
const SUBSTRATE_TILE_MAP: Readonly<Record<string, readonly string[]>> = {
  concrete: [
    "vitrified",
    "double_charge_vitrified",
    "full_body_vitrified",
    "glazed_vitrified",
    "porcelain",
    "ceramic_floor",
    "marble",
    "granite",
    "natural_stone",
    "large_format_slab",
    "terracotta",
    "mosaic",
  ],
  cement_plaster: [
    "ceramic_wall",
    "glazed_vitrified",
    "vitrified",
    "porcelain",
    "mosaic",
    "glass_mosaic",
  ],
  cement_screed: [
    "vitrified",
    "full_body_vitrified",
    "ceramic_floor",
    "marble",
    "granite",
    "natural_stone",
    "large_format_slab",
  ],
  brick_masonry: ["ceramic_wall", "glazed_vitrified", "terracotta", "mosaic"],
  aac_block: ["ceramic_wall", "glazed_vitrified", "vitrified", "mosaic"],
  gypsum_plaster: ["ceramic_wall", "glass_mosaic", "mosaic"],
  gypsum_board: ["ceramic_wall", "glass_mosaic", "mosaic"],
  cement_board: ["ceramic_wall", "vitrified", "porcelain", "natural_stone"],
  plywood: ["ceramic_wall", "vitrified", "porcelain", "mosaic"],
  existing_tile: [
    "vitrified",
    "glazed_vitrified",
    "porcelain",
    "ceramic_floor",
    "large_format_slab",
  ],
  marble_granite: ["marble", "granite", "natural_stone", "large_format_slab"],
  metal: ["glass_mosaic", "mosaic", "porcelain"],
  waterproofing_membrane: [
    "vitrified",
    "ceramic_floor",
    "porcelain",
    "mosaic",
    "glass_mosaic",
  ],
  swimming_pool_shell: ["glass_mosaic", "mosaic", "porcelain", "natural_stone"],
  glass: ["glass_mosaic", "mosaic"],
};

// ====================================================== catalog: application areas

type ApplicationAreaSeed = { id: string; name: string };

const APPLICATION_AREAS: readonly ApplicationAreaSeed[] = [
  { id: "living_room", name: "Living Room" },
  { id: "bedroom", name: "Bedroom" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bathroom", name: "Bathroom" },
  { id: "balcony", name: "Balcony" },
  { id: "terrace", name: "Terrace" },
  { id: "exterior_facade", name: "Exterior Facade" },
  { id: "swimming_pool", name: "Swimming Pool" },
];

// ========================================================= Kamdhenu products

type ProductSeed = {
  code: string;
  name: string;
  description: string;
  enClassification: string;
  applicationAreas: readonly string[];
  technicalParams: TechnicalParams;
};

/**
 * TODO: every technicalParams value below is null on purpose.
 *
 * Publishing invented spec numbers would be worse than publishing none: these
 * values are read straight into the comparison table, the AI sales pitch and the
 * recommendation letter, where a sales RM would quote them to a customer. Copy
 * the real figures from each product's TDS (all 20 canonical keys, values as
 * strings exactly as printed, null only where the sheet is genuinely silent).
 *
 * The EN classifications and descriptions below are also placeholders to confirm.
 */
const PRODUCTS: readonly ProductSeed[] = [
  {
    code: "K50",
    name: "Kamdhenu Tile Adhesive K50",
    description:
      "TODO: confirm — entry-level cementitious adhesive for interior ceramic tiles on concrete.",
    enClassification: "C1T",
    applicationAreas: ["living_room", "bedroom", "kitchen"],
    technicalParams: emptyParams(),
  },
  {
    code: "K60",
    name: "Kamdhenu Tile Adhesive K60",
    description:
      "TODO: confirm — improved adhesive with extended open time for interior floors and walls.",
    enClassification: "C1TE",
    applicationAreas: ["living_room", "bedroom", "kitchen", "bathroom"],
    technicalParams: emptyParams(),
  },
  {
    code: "K80",
    name: "Kamdhenu Tile Adhesive K80",
    description:
      "TODO: confirm — high-strength adhesive for vitrified tiles and wet areas.",
    enClassification: "C2T",
    applicationAreas: ["kitchen", "bathroom", "balcony", "terrace"],
    technicalParams: emptyParams(),
  },
  {
    code: "K90",
    name: "Kamdhenu Tile Adhesive K90",
    description:
      "TODO: confirm — deformable adhesive for large-format tiles, exteriors and tile-on-tile.",
    enClassification: "C2TE S1",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "balcony",
      "terrace",
      "exterior_facade",
    ],
    technicalParams: emptyParams(),
  },
  {
    code: "KX",
    name: "Kamdhenu Tile Adhesive KX",
    description:
      "TODO: confirm — highly deformable premium adhesive for swimming pools and demanding substrates.",
    enClassification: "C2TE S2",
    applicationAreas: [
      "bathroom",
      "terrace",
      "exterior_facade",
      "swimming_pool",
    ],
    technicalParams: emptyParams(),
  },
];

// ============================================================ example competitors

type CompetitorSeed = {
  name: string;
  slug: string;
  product: {
    name: string;
    enClassification: string;
    technicalParams: TechnicalParams;
  };
};

/**
 * TODO: replace with the real competitor set.
 *
 * These are deliberately fictional companies with illustrative specs so the
 * comparison screen has something to render during development. Do NOT ship
 * them: real competitor products must be created through the admin panel, either
 * from an uploaded TDS (spec_source 'tds_ai') or typed in (spec_source 'manual').
 */
const EXAMPLE_COMPETITORS: readonly CompetitorSeed[] = [
  {
    name: "Example Adhesives Co. (sample data)",
    slug: "example_adhesives",
    product: {
      name: "ExampleFix Standard (sample data)",
      enClassification: "C1T",
      technicalParams: {
        ...emptyParams(),
        open_time: "10-15 minutes",
        pot_life: "2 hours",
        adjustability_time: "10 minutes",
        tensile_adhesion_is: "≥ 0.5 N/mm²",
        mixing_ratio: "1 : 0.28",
        coverage: "3.5-4 m² per 20kg @ 3mm bed",
        setting_time: "24 hours",
        adhesive_thickness: "3-6 mm",
        application_temp: "5°C to 35°C",
        shelf_life: "6 months",
        packaging: "20 KG bag",
        color: "Grey",
      },
    },
  },
  {
    name: "Sample Buildchem Ltd. (sample data)",
    slug: "sample_buildchem",
    product: {
      name: "SampleBond Premium (sample data)",
      enClassification: "C2TE",
      technicalParams: {
        ...emptyParams(),
        open_time: "20-30 minutes",
        pot_life: "3 hours",
        adjustability_time: "15 minutes",
        tensile_adhesion_is: "≥ 1.0 N/mm²",
        tensile_adhesion_water: "0.9-1.0 N/mm²",
        slip_resistance: "≤ 0.5 mm",
        mixing_ratio: "1 : 0.25",
        coverage: "4-5 m² per 20kg @ 3mm bed",
        setting_time: "24 hours",
        adhesive_thickness: "3-10 mm",
        application_temp: "5°C to 35°C",
        shelf_life: "12 months",
        packaging: "20 KG bag",
        color: "Grey",
      },
    },
  },
  {
    name: "Demo Tilecare Pvt. Ltd. (sample data)",
    slug: "demo_tilecare",
    product: {
      name: "DemoGrip Flex (sample data)",
      enClassification: "C2TE S1",
      technicalParams: {
        ...emptyParams(),
        open_time: "25-30 minutes",
        pot_life: "3-4 hours",
        adjustability_time: "20 minutes",
        tensile_adhesion_is: "≥ 1.0 N/mm²",
        tensile_adhesion_heat: "0.95-1.05 N/mm²",
        shear_adhesion_dry: "1.0-1.2 N/mm²",
        mixing_ratio: "1 : 0.26",
        coverage: "4-4.5 m² per 20kg @ 3mm bed",
        adhesive_thickness: "3-12 mm",
        mixed_density: "1.6-1.8 kg/L",
        application_temp: "5°C to 40°C",
        shelf_life: "9 months",
        packaging: "20 KG bag",
        color: "Grey / White",
      },
    },
  },
];

// ==================================================================== seeding

const counts = {
  substrates: 0,
  tileTypes: 0,
  tileTypeSizes: 0,
  substrateTileMap: 0,
  applicationAreas: 0,
  products: 0,
  competitors: 0,
  competitorProducts: 0,
  admins: 0,
};

async function seedCatalog(): Promise<void> {
  for (const [index, substrate] of SUBSTRATES.entries()) {
    await prisma.substrate.upsert({
      where: { id: substrate.id },
      create: { ...substrate, sortOrder: index },
      update: { name: substrate.name, sortOrder: index },
    });
    counts.substrates += 1;
  }

  for (const [index, tileType] of TILE_TYPES.entries()) {
    const { sizes, ...fields } = tileType;

    await prisma.tileType.upsert({
      where: { id: fields.id },
      create: { ...fields, sortOrder: index },
      update: {
        name: fields.name,
        category: fields.category,
        sortOrder: index,
      },
    });
    counts.tileTypes += 1;

    for (const sizeLabel of sizes) {
      await prisma.tileTypeSize.upsert({
        where: {
          tileTypeId_sizeLabel: { tileTypeId: fields.id, sizeLabel },
        },
        create: { tileTypeId: fields.id, sizeLabel },
        update: {},
      });
      counts.tileTypeSizes += 1;
    }
  }

  for (const [substrateId, tileTypeIds] of Object.entries(
    SUBSTRATE_TILE_MAP,
  )) {
    for (const tileTypeId of tileTypeIds) {
      await prisma.substrateTileMap.upsert({
        where: { substrateId_tileTypeId: { substrateId, tileTypeId } },
        create: { substrateId, tileTypeId },
        update: {},
      });
      counts.substrateTileMap += 1;
    }
  }

  for (const [index, area] of APPLICATION_AREAS.entries()) {
    await prisma.applicationArea.upsert({
      where: { id: area.id },
      create: { ...area, sortOrder: index },
      update: { name: area.name, sortOrder: index },
    });
    counts.applicationAreas += 1;
  }
}

async function seedProducts(): Promise<void> {
  for (const product of PRODUCTS) {
    // `code` is unique only among live rows (partial index), which Prisma cannot
    // use as an upsert target, so resolve the live row first.
    const existing = await prisma.product.findFirst({
      where: { code: product.code, deletedAt: null },
      select: { id: true },
    });

    const data = {
      code: product.code,
      name: product.name,
      description: product.description,
      enClassification: product.enClassification,
      applicationAreas: [...product.applicationAreas],
      technicalParams: product.technicalParams,
    };

    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
    } else {
      await prisma.product.create({ data });
    }
    counts.products += 1;
  }
}

async function seedCompetitors(): Promise<void> {
  for (const competitor of EXAMPLE_COMPETITORS) {
    const existing = await prisma.competitor.findFirst({
      where: { slug: competitor.slug, deletedAt: null },
      select: { id: true },
    });

    const competitorRow = existing
      ? await prisma.competitor.update({
          where: { id: existing.id },
          data: { name: competitor.name },
        })
      : await prisma.competitor.create({
          data: { name: competitor.name, slug: competitor.slug },
        });
    counts.competitors += 1;

    const existingProduct = await prisma.competitorProduct.findFirst({
      where: {
        competitorId: competitorRow.id,
        name: competitor.product.name,
        deletedAt: null,
      },
      select: { id: true },
    });

    const productData = {
      competitorId: competitorRow.id,
      name: competitor.product.name,
      enClassification: competitor.product.enClassification,
      technicalParams: competitor.product.technicalParams,
      specSource: "manual" as const,
    };

    if (existingProduct) {
      await prisma.competitorProduct.update({
        where: { id: existingProduct.id },
        data: productData,
      });
    } else {
      await prisma.competitorProduct.create({ data: productData });
    }
    counts.competitorProducts += 1;
  }
}

/**
 * Admin allow-list (blueprint §5.2): a Google login only succeeds if an active
 * admin row already matches, so these rows *are* the authorization list.
 * `googleSub` stays null until the admin's first successful Google sign-in.
 */
async function seedAdmins(): Promise<void> {
  if (env.ADMIN_ALLOWLIST_EMAILS.length === 0) {
    logger.warn(
      "ADMIN_ALLOWLIST_EMAILS is empty — no admin can sign in until one is seeded",
    );
    return;
  }

  for (const email of env.ADMIN_ALLOWLIST_EMAILS) {
    // uq_users_email is a partial index (role = 'admin'), so resolve by hand.
    const existing = await prisma.user.findFirst({
      where: { email, role: "admin" },
      select: { id: true },
    });

    if (existing) {
      // Never touch googleSub here: it is bound on first login and must survive.
      await prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    } else {
      await prisma.user.create({
        data: { email, role: "admin", isActive: true },
      });
    }
    counts.admins += 1;
  }
}

async function main(): Promise<void> {
  logger.info({ appEnv: env.APP_ENV }, "Seeding database…");

  if (env.APP_ENV === "development") {
    await seedCatalog();
    await seedProducts();
    await seedCompetitors();
  } else {
    // Staging/production must never receive sample catalogue data.
    logger.info("Skipping sample catalog and competitor seed outside development");
  }

  // The allow-list is safe to upsert at every boot and enables Google sign-in.
  await seedAdmins();

  logger.info(counts, "Seed complete");
  logger.warn(
    "Catalog slugs and all Kamdhenu technicalParams are placeholders — see the TODO block at the top of src/db/seed.ts",
  );
}

try {
  await main();
} catch (error) {
  logger.error({ err: error }, "Seed failed");
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}

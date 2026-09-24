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
  { id: "outdoor_facade", name: "Outdoor Facade" },
  { id: "elevation", name: "Elevation" },
  { id: "swimming_pool", name: "Swimming Pool" },
  { id: "industrial_floor", name: "Industrial Floor" },
  { id: "commercial_high_traffic", name: "Commercial High Traffic" },
];

// ========================================================= Kamdhenu products

type ProductSeed = {
  code: string;
  name: string;
  description: string;
  tagline: string;
  isType: string;
  enClassification: string;
  maxTileSize: string;
  applicationAreas: readonly string[];
  installationSuitability: readonly ("indoor" | "outdoor")[];
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
    name: "K50 Floor & Wall Tile Adhesive",
    description:
      "Polymer-modified adhesive for fixing ceramic and vitrified tiles on cementitious substrates. Ideal for indoor wet and dry zones, kitchens, bathrooms, light-traffic floors.",
    tagline:
      "Polymer-modified for ceramic and small vitrified tiles in indoor wet/dry zones.",
    isType: "Type 1T",
    enClassification: "C1TE",
    maxTileSize: "Vitrified up to 600x600mm walls/floors, up to 600x1200mm floors",
    applicationAreas: ["kitchen", "bathroom", "living_room"],
    installationSuitability: ["indoor"],
    technicalParams: {
      open_time: "35-40 minutes",
      pot_life: "4-5 hours",
      adjustability_time: "~45 minutes",
      tensile_adhesion_is: "≥ 0.5 N/mm²",
      tensile_adhesion_water: "0.50-0.60 N/mm²",
      tensile_adhesion_heat: "1.2-1.5 N/mm²",
      tensile_adhesion_freeze_thaw: "0.55-0.65 N/mm²",
      slip_resistance: "≤ 0.5 mm",
      shear_adhesion_dry: "1.1-1.3 N/mm²",
      shear_adhesion_wet: "1.0-1.4 N/mm²",
      mixing_ratio: "1 : 0.24 by weight",
      coverage: "5-6 m² per 20kg @ 3mm bed",
      setting_time: "24 hours",
      adhesive_thickness: "3-12 mm",
      mixed_density: "1.7-1.9 kg/L",
      application_temp: "5°C to 35°C",
      voc_content: "< 4 g/kg (EPA 24)",
      shelf_life: "12 months",
      packaging: "20 KG bag",
      color: "Grey",
    },
  },
  {
    code: "K60",
    name: "K60 Superior Floor & Wall Tile Adhesive",
    description:
      "Highly polymer-modified for ceramic, semi-vitreous, vitrified tiles, and natural stones. Suitable for indoor/outdoor, dry/wet, vertical/horizontal. Recommended for tile-on-tile.",
    tagline:
      "Versatile polymer-modified adhesive — indoor/outdoor, wet/dry, tile-on-tile.",
    isType: "Type 2T",
    enClassification: "C2T",
    maxTileSize: "Up to 800x800mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "living_room",
      "outdoor_facade",
      "commercial_high_traffic",
    ],
    installationSuitability: ["indoor", "outdoor"],
    technicalParams: {
      open_time: "35-40 minutes",
      pot_life: "4-5 hours",
      adjustability_time: "30-35 minutes",
      tensile_adhesion_is: "≥ 1.0 N/mm²",
      tensile_adhesion_water: "1.25-1.35 N/mm²",
      tensile_adhesion_heat: "1.15-1.35 N/mm²",
      tensile_adhesion_freeze_thaw: "1.25-1.35 N/mm²",
      slip_resistance: "≤ 0.5 mm",
      shear_adhesion_dry: "1.50-1.75 N/mm²",
      shear_adhesion_wet: "1.10-1.35 N/mm²",
      mixing_ratio: "Grey 1:0.24-0.26 / White 1:0.25-0.27",
      coverage: "5-6 m² per 20kg @ 3mm bed",
      setting_time: "24 hours",
      adhesive_thickness: "3-12 mm",
      mixed_density: "1.65-1.85 kg/L",
      application_temp: "5°C to 35°C",
      voc_content: "< 1.2 g/kg (EPA 24)",
      shelf_life: "12 months",
      packaging: "20 KG bag",
      color: "Grey, White",
    },
  },
  {
    code: "K80",
    name: "K80 Superior Tile & Stone Adhesive",
    description:
      "Polymer-modified with excellent non-slip, engineered for vertical applications. Ideal for large format vitrified, porcelain, heavy natural stones on demanding interior/exterior walls and floors.",
    tagline:
      "High-performance, non-slip — large format vitrified, porcelain, heavy stones.",
    isType: "Type 2T",
    enClassification: "C2TE",
    maxTileSize: "Up to 1200x1200mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "outdoor_facade",
      "elevation",
      "living_room",
      "commercial_high_traffic",
    ],
    installationSuitability: ["indoor", "outdoor"],
    technicalParams: {
      open_time: "30 minutes",
      pot_life: "4 hours",
      adjustability_time: "30 minutes",
      tensile_adhesion_is: "≥ 1.0 N/mm²",
      tensile_adhesion_water: "1.25-1.35 N/mm²",
      tensile_adhesion_heat: "1.00-1.10 N/mm²",
      tensile_adhesion_freeze_thaw: "1.25-1.35 N/mm²",
      slip_resistance: "0.3-0.4 mm",
      shear_adhesion_dry: "1.50-1.75 N/mm²",
      shear_adhesion_wet: "1.10-1.35 N/mm²",
      mixing_ratio: "Grey 1:0.27 / White 1:0.29",
      coverage: "5-6 m² per 20kg @ 3mm bed",
      setting_time: "24 hours",
      adhesive_thickness: "3-12 mm",
      mixed_density: "1.65 ± 0.05 kg/L",
      application_temp: "5°C to 35°C",
      voc_content: "< 2 g/kg (EPA 24)",
      shelf_life: "12 months",
      packaging: "20 KG bag",
      color: "Grey, White",
    },
  },
  {
    code: "K90",
    name: "K90 Paramount Tile & Stone Adhesive",
    description:
      "Highly flexible polymer-modified with superior non-slip and high deformability. Engineered for challenging substrates — plywood, gypsum boards, facades. Suitable for all interior/exterior dry/wet areas including pools.",
    tagline:
      "Highly flexible, deformable — challenging substrates like plywood, gypsum, facades.",
    isType: "Type 3TS1",
    enClassification: "C2TES1",
    maxTileSize: "Up to 1200x2400mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "outdoor_facade",
      "elevation",
      "swimming_pool",
      "commercial_high_traffic",
    ],
    installationSuitability: ["indoor", "outdoor"],
    technicalParams: {
      open_time: "30-35 minutes",
      pot_life: "4-5 hours",
      adjustability_time: "30-35 minutes",
      tensile_adhesion_is: "≥ 1.0 N/mm²",
      tensile_adhesion_water: "1.25-1.75 N/mm²",
      tensile_adhesion_heat: "1.25-1.50 N/mm²",
      tensile_adhesion_freeze_thaw: "1.50-2.00 N/mm²",
      slip_resistance: "0.20-0.30 mm",
      shear_adhesion_dry: "1.75-2.00 N/mm²",
      shear_adhesion_wet: "1.30-1.55 N/mm²",
      mixing_ratio: "Grey 1:0.24-0.26 / White 1:0.25-0.27",
      coverage: "5-6 m² per 20kg @ 3mm bed",
      setting_time: "24 hours",
      adhesive_thickness: "3-12 mm",
      mixed_density: "1.65-1.85 kg/L",
      application_temp: "5°C to 35°C",
      voc_content: "< 1.2 g/kg (EPA 24)",
      shelf_life: "12 months",
      packaging: "20 KG bag",
      color: "Grey, White",
      transverse_deformation_s1: "2.5-2.7 mm",
    },
  },
  {
    code: "KX",
    name: "Kamdhenu X — The Ultimate Adhesive",
    description:
      "Advanced highly deformable polymer-modified adhesive with extended open time and superior non-slip. For all heavy and extra-large format tiles/slabs on facades, industrial floors, areas with extreme thermal variation or vibration.",
    tagline:
      "Highly deformable, extended open time — extra-large slabs, facades, industrial.",
    isType: "Type 4TS2",
    enClassification: "C2TES2",
    maxTileSize: "Extra-large slabs, no upper limit",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "outdoor_facade",
      "elevation",
      "swimming_pool",
      "industrial_floor",
      "commercial_high_traffic",
    ],
    installationSuitability: ["indoor", "outdoor"],
    technicalParams: {
      open_time: "Min. 40 minutes",
      pot_life: "4-4.5 hours",
      adjustability_time: "~40 minutes",
      tensile_adhesion_is: "≥ 1.5 N/mm²",
      tensile_adhesion_water: "1.25-1.35 N/mm²",
      tensile_adhesion_heat: "≥ 1.5 N/mm²",
      tensile_adhesion_freeze_thaw: "1.25-1.35 N/mm²",
      slip_resistance: "0.3-0.4 mm",
      shear_adhesion_dry: "≥ 1.5 N/mm²",
      shear_adhesion_wet: "≥ 1.0 N/mm²",
      mixing_ratio: "Grey 100:28 / White 100:30",
      coverage: "5-6 m² per 20kg @ 3mm bed",
      setting_time: "24 hours",
      adhesive_thickness: "3-12 mm",
      mixed_density: "1.6-1.7 kg/L",
      application_temp: "5°C to 35°C",
      voc_content: "< 0.2 g/L",
      shelf_life: "12 months",
      packaging: "20 KG bag",
      color: "White",
      deformability_s2: "≥ 3.0 mm",
    },
  },
];

// ============================================================ example competitors

// Updated type: a competitor now seeds MULTIPLE products, each with its own
// isType/enClassification/competesWith, mapped to real starting specs by EN class.
type CompetitorProductSeed = {
  name: string;
  isType: string;
  enClassification: string;
  competesWith: string; // Kamdhenu code this product competes with (K50/K60/K80/K90/KX)
  technicalParams: TechnicalParams;
};

type CompetitorSeed = {
  name: string;
  slug: string;
  products: readonly CompetitorProductSeed[];
};

// Industry-typical spec ranges per EN classification (same values as the original
// TYPE_DEFAULTS table). Used to give every competitor product real starting specs
// based on its published EN class, until an admin uploads/enters the real TDS.
const TYPE_DEFAULTS: Record<string, TechnicalParams> = {
  C1T: {
    ...emptyParams(),
    open_time: "20-30 minutes",
    pot_life: "2-3 hours",
    adjustability_time: "10-15 minutes",
    tensile_adhesion_is: "≥ 0.5 N/mm²",
    tensile_adhesion_water: "0.45-0.55 N/mm²",
    tensile_adhesion_heat: "0.50-0.60 N/mm²",
    tensile_adhesion_freeze_thaw: "0.50-0.55 N/mm²",
    slip_resistance: "≤ 0.5 mm",
    shear_adhesion_dry: "1.0-1.2 N/mm²",
    shear_adhesion_wet: "0.9-1.1 N/mm²",
    mixing_ratio: "1 : 0.25",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-10 mm",
    mixed_density: "1.6-1.8 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 5 g/kg",
    shelf_life: "9-12 months",
    packaging: "20 KG bag",
    color: "Grey",
  },
  C1TE: {
    ...emptyParams(),
    open_time: "30 minutes",
    pot_life: "3-4 hours",
    adjustability_time: "20-30 minutes",
    tensile_adhesion_is: "≥ 0.5 N/mm²",
    tensile_adhesion_water: "0.50-0.60 N/mm²",
    tensile_adhesion_heat: "0.55-0.65 N/mm²",
    tensile_adhesion_freeze_thaw: "0.55-0.65 N/mm²",
    slip_resistance: "≤ 0.5 mm",
    shear_adhesion_dry: "1.1-1.3 N/mm²",
    shear_adhesion_wet: "1.0-1.2 N/mm²",
    mixing_ratio: "1 : 0.24-0.26",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-10 mm",
    mixed_density: "1.6-1.8 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 4 g/kg",
    shelf_life: "12 months",
    packaging: "20 KG bag",
    color: "Grey",
  },
  C2T: {
    ...emptyParams(),
    open_time: "30 minutes",
    pot_life: "3-4 hours",
    adjustability_time: "20-30 minutes",
    tensile_adhesion_is: "≥ 1.0 N/mm²",
    tensile_adhesion_water: "1.0-1.1 N/mm²",
    tensile_adhesion_heat: "1.0-1.1 N/mm²",
    tensile_adhesion_freeze_thaw: "1.0-1.1 N/mm²",
    slip_resistance: "≤ 0.5 mm",
    shear_adhesion_dry: "1.3-1.5 N/mm²",
    shear_adhesion_wet: "1.0-1.2 N/mm²",
    mixing_ratio: "1 : 0.25",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-12 mm",
    mixed_density: "1.6-1.8 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 3 g/kg",
    shelf_life: "12 months",
    packaging: "20 KG bag",
    color: "Grey, White",
  },
  C2TE: {
    ...emptyParams(),
    open_time: "30 minutes",
    pot_life: "3-4 hours",
    adjustability_time: "30 minutes",
    tensile_adhesion_is: "≥ 1.0 N/mm²",
    tensile_adhesion_water: "1.10-1.25 N/mm²",
    tensile_adhesion_heat: "1.00-1.10 N/mm²",
    tensile_adhesion_freeze_thaw: "1.10-1.25 N/mm²",
    slip_resistance: "≤ 0.5 mm",
    shear_adhesion_dry: "1.4-1.6 N/mm²",
    shear_adhesion_wet: "1.0-1.2 N/mm²",
    mixing_ratio: "1 : 0.25-0.27",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-12 mm",
    mixed_density: "1.6-1.8 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 2 g/kg",
    shelf_life: "12 months",
    packaging: "20 KG bag",
    color: "Grey, White",
  },
  C2TES1: {
    ...emptyParams(),
    open_time: "30 minutes",
    pot_life: "3-4 hours",
    adjustability_time: "30 minutes",
    tensile_adhesion_is: "≥ 1.0 N/mm²",
    tensile_adhesion_water: "1.20-1.50 N/mm²",
    tensile_adhesion_heat: "1.10-1.30 N/mm²",
    tensile_adhesion_freeze_thaw: "1.30-1.60 N/mm²",
    slip_resistance: "0.3-0.4 mm",
    shear_adhesion_dry: "1.6-1.8 N/mm²",
    shear_adhesion_wet: "1.2-1.4 N/mm²",
    transverse_deformation_s1: "2.5-2.7 mm", // extra key beyond the 20 canonical fields
    mixing_ratio: "1 : 0.25-0.28",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-12 mm",
    mixed_density: "1.6-1.8 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 2 g/kg",
    shelf_life: "12 months",
    packaging: "20 KG bag",
    color: "Grey, White",
  },
  C2TES2: {
    ...emptyParams(),
    open_time: "30-40 minutes",
    pot_life: "3-4 hours",
    adjustability_time: "30-35 minutes",
    tensile_adhesion_is: "≥ 1.0 N/mm²",
    tensile_adhesion_water: "1.20-1.30 N/mm²",
    tensile_adhesion_heat: "1.00-1.10 N/mm²",
    tensile_adhesion_freeze_thaw: "1.20-1.30 N/mm²",
    slip_resistance: "0.3-0.4 mm",
    shear_adhesion_dry: "1.5-1.7 N/mm²",
    shear_adhesion_wet: "1.2-1.4 N/mm²",
    deformability_s2: "≥ 3.0 mm", // extra key beyond the 20 canonical fields
    mixing_ratio: "1 : 0.27-0.30",
    coverage: "4-5 m² per 20kg @ 3mm bed",
    setting_time: "24 hours",
    adhesive_thickness: "3-12 mm",
    mixed_density: "1.6-1.7 kg/L",
    application_temp: "5°C to 35°C",
    voc_content: "< 1 g/kg",
    shelf_life: "12 months",
    packaging: "20 KG bag",
    color: "White",
  },
  R2T: {
    ...emptyParams(),
    open_time: "40-60 minutes",
    pot_life: "30-45 minutes",
    adjustability_time: "30 minutes",
    tensile_adhesion_is: "≥ 2.0 N/mm² (Reactive)",
    tensile_adhesion_water: "≥ 2.0 N/mm²",
    tensile_adhesion_heat: "≥ 2.0 N/mm²",
    tensile_adhesion_freeze_thaw: "≥ 2.0 N/mm²",
    slip_resistance: "0.2-0.3 mm",
    shear_adhesion_dry: "≥ 2.0 N/mm²",
    shear_adhesion_wet: "≥ 2.0 N/mm²",
    mixing_ratio: "Two-component (epoxy/PU)",
    coverage: "3-4 m² per 5kg",
    setting_time: "24 hours",
    adhesive_thickness: "1-10 mm",
    mixed_density: "1.5-1.7 kg/L",
    application_temp: "10°C to 30°C",
    voc_content: "< 1 g/kg",
    shelf_life: "12 months",
    packaging: "5 KG kit",
    color: "Grey, White",
  },
};

// Same matching logic as the original enrich_competitor_params: normalize the EN
// classification, match the FIRST known key found in it, else fall back to C2TE.
const EN_MATCH_ORDER = ["C2TES2", "C2TES1", "C2TE", "C2T", "C1TE", "C1T", "R2T"] as const;

function defaultsForEnClassification(enType: string): TechnicalParams {
  const normalized = enType.toUpperCase().replace(/\s+/g, "");
  const matchedKey = EN_MATCH_ORDER.find((key) => normalized.includes(key));
  return { ...TYPE_DEFAULTS[matchedKey ?? "C2TE"]! };
}

// Real competitor catalog: 4 brands, 39 products, converted directly from the
// original Python _COMPETITOR_CATALOG. Each product's technicalParams is derived
// from its EN classification via defaultsForEnClassification (spec_source: 'manual'
// at seed time — an admin can later replace these with a real TDS upload).
const EXAMPLE_COMPETITORS: readonly CompetitorSeed[] = [
  {
    name: "MYK Laticrete",
    slug: "myk_laticrete",
    products: [
      { name: "LATICRETE 303 Floor & Wall Tile Adhesive", isType: "Type 1T", enClassification: "C1T", competesWith: "K50", technicalParams: defaultsForEnClassification("C1T") },
      { name: "LATICRETE 307", isType: "Type 2T", enClassification: "C1T", competesWith: "K60", technicalParams: defaultsForEnClassification("C1T") },
      { name: "LATICRETE 320 Stone Adhesive", isType: "Type 2", enClassification: "C2TE", competesWith: "K60", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "LATICRETE 313", isType: "Type 2T", enClassification: "C1TE", competesWith: "K60", technicalParams: defaultsForEnClassification("C1TE") },
      { name: "LATICRETE 325 Shear Wall Adhesive", isType: "Type 2T", enClassification: "C2T", competesWith: "K80", technicalParams: defaultsForEnClassification("C2T") },
      { name: "LATICRETE 315 Plus", isType: "Type 2T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "LATICRETE 335 Super Flex", isType: "Type 3TS1", enClassification: "C2TES2", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES2") },
      { name: "LATICRETE 325 High Flex", isType: "Type 3T", enClassification: "C2TE", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "LATICRETE 345 Super Flex", isType: "Type 4TS2", enClassification: "C2ETS2", competesWith: "KX", technicalParams: defaultsForEnClassification("C2ETS2") },
      { name: "LATICRETE 335 Maxi", isType: "Type 4TS1", enClassification: "C2TES1", competesWith: "KX", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "DWA 215", isType: "Type 4TS2", enClassification: "D2TES2", competesWith: "KX", technicalParams: defaultsForEnClassification("D2TES2") },
    ],
  },
  {
    name: "Roff (Pidilite)",
    slug: "roff",
    products: [
      { name: "Roff New Construction Adhesive (NCA)", isType: "Type 1T", enClassification: "C1T", competesWith: "K50", technicalParams: defaultsForEnClassification("C1T") },
      { name: "Roff Tile Bonder", isType: "Type 1", enClassification: "C1", competesWith: "K50", technicalParams: defaultsForEnClassification("C1") },
      { name: "Roff Non-Skid Adhesive (NSA)", isType: "Type 2T", enClassification: "C2T", competesWith: "K60", technicalParams: defaultsForEnClassification("C2T") },
      { name: "Roff Vitrofix Adhesive", isType: "Type 2T", enClassification: "C2T", competesWith: "K60", technicalParams: defaultsForEnClassification("C2T") },
      { name: "Roff Vitrofix Ultra Adhesive", isType: "Type 3T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "Roff Extrofix Adhesive", isType: "Type 3TS1", enClassification: "C2TES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "Roff Extrofix Ultra Adhesive", isType: "Type 4TS1", enClassification: "C2TES1 S1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1 S1") },
      { name: "Roff Yogafix Adhesive", isType: "Type 4TS2", enClassification: "C2TES2", competesWith: "KX", technicalParams: defaultsForEnClassification("C2TES2") },
      { name: "Roff Master Fix Adhesive", isType: "Type 5 S2", enClassification: "R2T", competesWith: "KX", technicalParams: defaultsForEnClassification("R2T") },
      { name: "Roff Vertifix", isType: "Type 5 S2", enClassification: "R2T", competesWith: "KX", technicalParams: defaultsForEnClassification("R2T") },
    ],
  },
  {
    name: "Mapei",
    slug: "mapei",
    products: [
      { name: "KERABOND T", isType: "Type 1T", enClassification: "C1T", competesWith: "K50", technicalParams: defaultsForEnClassification("C1T") },
      { name: "MAPESET IN", isType: "Type 2", enClassification: "C1", competesWith: "K50", technicalParams: defaultsForEnClassification("C1") },
      { name: "KERASET T", isType: "Type 2T", enClassification: "C2T", competesWith: "K60", technicalParams: defaultsForEnClassification("C2T") },
      { name: "ADESILEX P10", isType: "Type 3T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "ADESILEX P9", isType: "Type 3T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "KERAFLEX", isType: "Type 3T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "KERABOND PLUS", isType: "Type 3", enClassification: "C2E", competesWith: "K80", technicalParams: defaultsForEnClassification("C2E") },
      { name: "KERAFLEX EASY S1 ZERO", isType: "Type 4S1", enClassification: "C2ES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2ES1") },
      { name: "KERAFLEX MAXI S1 ZERO", isType: "Type 4TS1", enClassification: "C2TES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "ULTRALITE S1", isType: "Type 4TS1", enClassification: "C2TES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "ULTRALITE S2", isType: "Type 4TS2", enClassification: "C2TES2", competesWith: "KX", technicalParams: defaultsForEnClassification("C2TES2") },
      { name: "ELASTORAPID", isType: "Type 4TS2", enClassification: "C2FTS2", competesWith: "KX", technicalParams: defaultsForEnClassification("C2FTS2") },
      { name: "GRANIRAPID", isType: "Type 4TS1", enClassification: "C2FTS1", competesWith: "KX", technicalParams: defaultsForEnClassification("C2FTS1") },
    ],
  },
  {
    name: "Kerakoll",
    slug: "kerakoll",
    products: [
      { name: "Biotile", isType: "Type 1T", enClassification: "C1T", competesWith: "K50", technicalParams: defaultsForEnClassification("C1T") },
      { name: "Bioflex", isType: "Type 3T", enClassification: "C2TE", competesWith: "K80", technicalParams: defaultsForEnClassification("C2TE") },
      { name: "Bioflex S1", isType: "Type 4TS1", enClassification: "C2TES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "H40 Gel", isType: "Type 4TS1", enClassification: "C2TES1", competesWith: "K90", technicalParams: defaultsForEnClassification("C2TES1") },
      { name: "Superflex", isType: "Type 5TS2", enClassification: "C2TES2", competesWith: "KX", technicalParams: defaultsForEnClassification("C2TES2") },
    ],
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
      tagline: product.tagline,
      isType: product.isType,
      enClassification: product.enClassification,
      maxTileSize: product.maxTileSize,
      applicationAreas: [...product.applicationAreas],
      installationSuitability: [...product.installationSuitability],
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
        data: { name: competitor.name, slug: competitor.slug },
      })
      : await prisma.competitor.create({
        data: { name: competitor.name, slug: competitor.slug },
      });
    counts.competitors += 1;

    for (const product of competitor.products) {
      const existingProduct = await prisma.competitorProduct.findFirst({
        where: {
          competitorId: competitorRow.id,
          name: product.name,
          deletedAt: null,
        },
        select: { id: true },
      });

      const productData = {
        competitorId: competitorRow.id,
        name: product.name,
        isType: product.isType,
        enClassification: product.enClassification,
        competesWith: product.competesWith,
        technicalParams: product.technicalParams,
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

  if (env.APP_ENV !== "production") {
    await seedCatalog();
    await seedProducts();
    await seedCompetitors();
  } else {
    logger.info("Skipping sample catalog and competitor seed in production");
  }

  // The allow-list is safe to upsert at every boot and enables Google sign-in.
  await seedAdmins();

  const productCodes = PRODUCTS.map((product) => product.code);
  const competitorSlugs = EXAMPLE_COMPETITORS.map((competitor) => competitor.slug);
  const substrateIds = SUBSTRATES.map((substrate) => substrate.id);
  const tileTypeIds = TILE_TYPES.map((tileType) => tileType.id);
  const applicationAreaIds = APPLICATION_AREAS.map((area) => area.id);

  const [
    substrates,
    tileTypes,
    tileTypeSizes,
    substrateTileMap,
    applicationAreas,
    products,
    competitors,
    competitorProducts,
    admins,
  ] = await prisma.$transaction([
    prisma.substrate.count({ where: { id: { in: substrateIds } } }),
    prisma.tileType.count({ where: { id: { in: tileTypeIds } } }),
    prisma.tileTypeSize.count({ where: { tileTypeId: { in: tileTypeIds } } }),
    prisma.substrateTileMap.count({
      where: {
        substrateId: { in: substrateIds },
        tileTypeId: { in: tileTypeIds },
      },
    }),
    prisma.applicationArea.count({ where: { id: { in: applicationAreaIds } } }),
    prisma.product.count({ where: { code: { in: productCodes }, deletedAt: null } }),
    prisma.competitor.count({
      where: { slug: { in: competitorSlugs }, deletedAt: null },
    }),
    prisma.competitorProduct.count({
      where: {
        deletedAt: null,
        competitor: { slug: { in: competitorSlugs }, deletedAt: null },
      },
    }),
    prisma.user.count({ where: { role: "admin", isActive: true } }),
  ]);

  logger.info(
    {
      substrates,
      tileTypes,
      tileTypeSizes,
      substrateTileMap,
      applicationAreas,
      products,
      competitors,
      competitorProducts,
      admins,
    },
    "Seed complete",
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

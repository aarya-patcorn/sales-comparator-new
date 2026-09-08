import { env } from "../config/env.js";
import { prisma, disconnectPrisma } from "./client.js";
import { logger } from "../lib/logger.js";
import { PARAM_FIELDS } from "../lib/paramFields.js";
import { emptyParams, technicalParamsSchema } from "../validation/technicalParams.js";
import type { TechnicalParams } from "../validation/technicalParams.js";

// ============================================================ catalog: substrates

type SubstrateSeed = { id: string; name: string, description: string };

const SUBSTRATES: readonly SubstrateSeed[] = [
  {
    id: "concrete",
    name: "Concrete",
    description:
      "Composite construction material made of aggregate (sand, crushed stone, gravel) bound by hydraulic cement and water.",
  },
  {
    id: "cement_plaster",
    name: "Cement Plaster",
    description:
      "Homogeneous mix of Portland cement, fine aggregate, and water applied to concrete or brickwork for a smooth finish.",
  },
  {
    id: "cement_screed",
    name: "Cement Screed",
    description:
      "Thin coating of specialized mortar (cement and sharp sand) applied over structural concrete to create a level surface.",
  },
  {
    id: "cement_mortar_beds",
    name: "Cement Mortar Beds",
    description:
      "Thick bed (25–50 mm) of cement and sand used as a sturdy foundation for tile or stone laying.",
  },
  {
    id: "brick_masonry",
    name: "Brick Masonry",
    description:
      "Bricks bonded by cement mortar in a systematic pattern to create a durable structural system.",
  },
  {
    id: "plywood",
    name: "Plywood",
    description:
      "Engineered wood panel made from cross-grained, glued veneers for strength and stability.",
  },
  {
    id: "gypsum_boards",
    name: "Gypsum Boards / Drywall",
    description:
      "Manufactured panel of gypsum plaster sandwiched between paper sheets, commonly used for interior walls.",
  },
  {
    id: "cement_boards",
    name: "Cement Boards / Backer Boards",
    description:
      "Heavy-duty, water-resistant board made from Portland cement, water, and reinforcing fibers, commonly used in wet areas.",
  },
  {
    id: "mdf",
    name: "Medium-Density Fiberboard (MDF)",
    description:
      "Engineered wood panel made from fine wood fibers combined with wax and resin under high temperature and pressure.",
  },
  {
    id: "calcium_silicate",
    name: "Calcium Silicate Boards",
    description:
      "High-performance autoclaved boards made from siliceous materials and calcium oxide reinforced with cellulose fibers.",
  },
  {
    id: "metallic",
    name: "Metallic Substrates",
    description:
      "Metal surfaces such as steel, stainless steel, aluminum, and copper.",
  },
  {
    id: "glass",
    name: "Glass Substrates",
    description:
      "Glass blocks, mirrored panels, or toughened glass sheets used as a base for tile installation.",
  },
  {
    id: "terrazzo",
    name: "Terrazzo",
    description:
      "Composite surface made from marble, quartz, or granite chips combined with cementitious or epoxy binder, then ground and polished.",
  },
  {
    id: "tile_on_tile",
    name: "Existing Tiled Surface (Tile-on-Tile)",
    description:
      "Overlay installation in which new tiles are installed directly over an existing finished tiled surface.",
  },
  {
    id: "rubber_pvc_lino",
    name: "Rubber, PVC, Linoleum",
    description:
      "Resilient and flexible substrates that require specialized surface preparation.",
  },
];

// ============================================================ catalog: tile types

type TileTypeSeed = {
  id: string;
  name: string;
  description: string | null;
  sizes: readonly string[];
};

const TILE_TYPES: readonly TileTypeSeed[] = [
  {
    id: "vitrified",
    name: "Vitrified",
    description:
      "Ceramic tiles with extremely low porosity, fired at high temperatures.",
    sizes: [
      "12 x 12 in",
      "16 x 16 in",
      "24 x 24 in",
      "24 x 48 in",
      "32 x 32 in",
      "32 x 48 in",
      "32 x 62 in",
      "40 x 40 in",
      "48 x 48 in",
      "48 x 72 in",
      "48 x 96 in",
    ],
  },
  {
    id: "ceramic",
    name: "Ceramic",
    description:
      "Thin slabs made from natural clay, silica, and water, hardened through kiln firing.",
    sizes: [
      "1 x 1 in",
      "2 x 2 in",
      "3 x 6 in",
      "4 x 4 in",
      "6 x 6 in",
      "12 x 12 in",
      "16 x 16 in",
      "18 x 18 in",
      "24 x 24 in",
    ],
  },
  {
    id: "granite",
    name: "Granite",
    description:
      "Natural stone tiles cut from granite blocks containing quartz, feldspar, and mica.",
    sizes: ["12 x 12 in", "16 x 16 in", "18 x 18 in", "24 x 24 in"],
  },
  {
    id: "stone",
    name: "Natural Stone",
    description: "Thin slabs of natural rock quarried from the earth.",
    sizes: [
      "12 x 12 in",
      "12 x 24 in",
      "16 x 16 in",
      "18 x 18 in",
      "24 x 24 in",
    ],
  },
  {
    id: "marble",
    name: "Marble",
    description:
      "Metamorphic rock formed from limestone and recognized for its natural veining.",
    sizes: [
      "12 x 12 in",
      "12 x 24 in",
      "18 x 18 in",
      "24 x 24 in",
      "36 x 36 in",
    ],
  },
  {
    id: "porcelain",
    name: "Porcelain",
    description:
      "High-performance ceramic made from dense kaolin clay and fired at 1200–1400°C.",
    sizes: [
      "6 x 6 in",
      "12 x 12 in",
      "12 x 24 in",
      "18 x 18 in",
      "24 x 24 in",
      "24 x 48 in",
      "32 x 32 in",
      "48 x 48 in",
    ],
  },
  {
    id: "glass_tile",
    name: "Glass",
    description:
      "Glass pieces that are cut, cast, or pressed and kiln-fired to create a translucent finish.",
    sizes: [
      "1 x 1 in",
      "2 x 2 in",
      "3 x 6 in",
      "4 x 4 in",
      "6 x 6 in",
      "12 x 12 in",
    ],
  },
  {
    id: "cement_tile",
    name: "Cement Tile (Encaustic)",
    description:
      "Handmade artisanal tiles produced from cement, sand, marble dust, and pigments.",
    sizes: [
      "4 x 4 in",
      "8 x 8 in",
      "10 x 10 in",
      "12 x 12 in",
      "2 x 8 in",
      "4 x 8 in",
    ],
  },
  {
    id: "mosaic",
    name: "Mosaic",
    description: "Small tiles assembled into decorative patterns.",
    sizes: ["1 x 1 in", "2 x 2 in", "1 x 2 in", "12 x 12 in sheets"],
  },
  {
    id: "limestone",
    name: "Limestone",
    description: "Tiles made from natural sedimentary limestone.",
    sizes: [
      "12 x 12 in",
      "16 x 16 in",
      "18 x 18 in",
      "24 x 24 in",
      "12 x 24 in",
    ],
  },
  {
    id: "quarry",
    name: "Quarry",
    description: "Dense, unglazed ceramic tile manufactured from quarried clay.",
    sizes: ["4 x 4 in", "4 x 8 in", "6 x 6 in", "8 x 8 in", "12 x 12 in"],
  },
  {
    id: "travertine",
    name: "Travertine",
    description:
      "Sedimentary natural stone characterized by warm, earthy tones.",
    sizes: [
      "4 x 4 in",
      "6 x 6 in",
      "12 x 12 in",
      "16 x 16 in",
      "18 x 18 in",
      "24 x 24 in",
    ],
  },
  {
    id: "terracotta",
    name: "Terracotta",
    description: "Earthen reddish-brown clay tiles hardened through kiln firing.",
    sizes: ["4 x 4 in", "6 x 6 in", "8 x 8 in", "12 x 12 in", "16 x 16 in"],
  },
  {
    id: "vinyl",
    name: "Vinyl",
    description:
      "Synthetic, flexible flooring manufactured in tile, plank, or sheet formats.",
    sizes: [
      "12 x 12 in",
      "18 x 18 in",
      "24 x 24 in",
      "12 x 24 in",
      "6 x 36 in",
      "7 x 48 in",
      "9 x 48 in",
    ],
  },
];

/** substrate id -> tile type ids offered for it. */
const ALL_TILES: readonly string[] = TILE_TYPES.map((tile) => tile.id);

const SUBSTRATE_TILE_MAP: Readonly<Record<string, readonly string[]>> = {
  concrete: ALL_TILES,

  cement_plaster: ALL_TILES,

  cement_screed: ALL_TILES,

  cement_mortar_beds: ALL_TILES,

  brick_masonry: ALL_TILES,

  plywood: [
    "ceramic",
    "porcelain",
    "vitrified",
    "mosaic",
    "glass_tile",
    "vinyl",
  ],

  gypsum_boards: [
    "ceramic",
    "porcelain",
    "vitrified",
    "mosaic",
    "glass_tile",
  ],

  cement_boards: ALL_TILES,

  mdf: ["ceramic", "porcelain", "mosaic", "vinyl"],

  calcium_silicate: [
    "ceramic",
    "porcelain",
    "vitrified",
    "mosaic",
    "stone",
  ],

  metallic: ["ceramic", "porcelain", "mosaic", "glass_tile"],

  glass: ["mosaic", "glass_tile", "ceramic"],

  terrazzo: ALL_TILES,

  tile_on_tile: [
    "ceramic",
    "porcelain",
    "vitrified",
    "marble",
    "granite",
  ],

  rubber_pvc_lino: ["ceramic", "porcelain", "vinyl"],
};

// ====================================================== catalog: application areas

type ApplicationAreaSeed = { id: string; name: string };

const APPLICATION_AREAS: readonly ApplicationAreaSeed[] = [
  { id: "kitchen", name: "Kitchen" },
  { id: "bathroom", name: "Bathroom" },
  { id: "outdoor_facade", name: "Outdoor / Facade" },
  { id: "elevation", name: "Elevation" },
  { id: "swimming_pool", name: "Swimming Pool" },
  { id: "living_room", name: "Living Room" },
  { id: "industrial_floor", name: "Industrial Floor" },
  {
    id: "commercial_high_traffic",
    name: "Commercial High-Traffic",
  },
];

// ========================================================= Kamdhenu products

type ProductSeed = {
  code: string;
  name: string;
  description: string;
  tagline: string;
  maxTileSize: string;
  isType: string;
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
    name: "K50 Floor & Wall Tile Adhesive",
    isType: "Type 1T",
    enClassification: "C1TE",
    tagline:
      "Polymer-modified for ceramic and small vitrified tiles in indoor wet/dry zones.",
    description:
      "Polymer-modified adhesive for fixing ceramic and vitrified tiles on cementitious substrates. Ideal for indoor wet and dry zones, kitchens, bathrooms, and light-traffic floors.",
    maxTileSize:
      "Vitrified up to 600x600mm walls/floors, up to 600x1200mm floors",
    applicationAreas: ["kitchen", "bathroom", "living_room"],
    technicalParams: {
      "open_time": "35-40 minutes",
      "pot_life": "4-5 hours",
      "adjustability_time": "~45 minutes",
      "tensile_adhesion_is": "≥ 0.5 N/mm²",
      "tensile_adhesion_water": "0.50-0.60 N/mm²",
      "tensile_adhesion_heat": "1.2-1.5 N/mm²",
      "tensile_adhesion_freeze_thaw": "0.55-0.65 N/mm²",
      "slip_resistance": "≤ 0.5 mm",
      "shear_adhesion_dry": "1.1-1.3 N/mm²",
      "shear_adhesion_wet": "1.0-1.4 N/mm²",
      "deformability_s2": "",
      "mixing_ratio": "1 : 0.24 by weight",
      "coverage": "5-6 m² per 20kg @ 3mm bed",
      "setting_time": "24 hours",
      "adhesive_thickness": "3-12 mm",
      "mixed_density": "1.7-1.9 kg/L",
      "application_temp": "5°C to 35°C",
      "voc_content": "< 4 g/kg (EPA 24)",
      "shelf_life": "12 months",
      "packaging": "20 KG bag",
      "color": "Grey",
    },
  },
  {
    code: "K60",
    name: "K60 Superior Floor & Wall Tile Adhesive",
    isType: "Type 2T",
    enClassification: "C2T",
    tagline:
      "Versatile polymer-modified adhesive — indoor/outdoor, wet/dry, tile-on-tile.",
    description:
      "Highly polymer-modified for ceramic, semi-vitreous, vitrified tiles, and natural stones. Suitable for indoor/outdoor, dry/wet, vertical/horizontal applications. Recommended for tile-on-tile.",
    maxTileSize: "Up to 800x800mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "living_room",
      "outdoor_facade",
      "commercial_high_traffic",
    ],
    technicalParams: {
      "open_time": "35-40 minutes",
      "pot_life": "4-5 hours",
      "adjustability_time": "30-35 minutes",
      "tensile_adhesion_is": "≥ 1.0 N/mm²",
      "tensile_adhesion_water": "1.25-1.35 N/mm²",
      "tensile_adhesion_heat": "1.15-1.35 N/mm²",
      "tensile_adhesion_freeze_thaw": "1.25-1.35 N/mm²",
      "slip_resistance": "≤ 0.5 mm",
      "shear_adhesion_dry": "1.50-1.75 N/mm²",
      "shear_adhesion_wet": "1.10-1.35 N/mm²",
      "deformability_s2": "",
      "mixing_ratio":
        "Grey 1:0.24-0.26 / White 1:0.25-0.27",
      "coverage": "5-6 m² per 20kg @ 3mm bed",
      "setting_time": "24 hours",
      "adhesive_thickness": "3-12 mm",
      "mixed_density": "1.65-1.85 kg/L",
      "application_temp": "5°C to 35°C",
      "voc_content": "< 1.2 g/kg (EPA 24)",
      "shelf_life": "12 months",
      "packaging": "20 KG bag",
      "color": "Grey, White",
    },
  },
  {
    code: "K80",
    name: "K80 Superior Tile & Stone Adhesive",
    isType: "Type 2T",
    enClassification: "C2TE",
    tagline:
      "High-performance, non-slip — large format vitrified, porcelain, heavy stones.",
    description:
      "Polymer-modified with excellent non-slip properties and engineered for vertical applications. Ideal for large-format vitrified tiles, porcelain, and heavy natural stones on demanding interior and exterior walls and floors.",
    maxTileSize: "Up to 1200x1200mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "outdoor_facade",
      "elevation",
      "living_room",
      "commercial_high_traffic",
    ],
    technicalParams: {
      "open_time": "30 minutes",
      "pot_life": "4 hours",
      "adjustability_time": "30 minutes",
      "tensile_adhesion_is": "≥ 1.0 N/mm²",
      "tensile_adhesion_water": "1.25-1.35 N/mm²",
      "tensile_adhesion_heat": "1.00-1.10 N/mm²",
      "tensile_adhesion_freeze_thaw": "1.25-1.35 N/mm²",
      "slip_resistance": "0.3-0.4 mm",
      "shear_adhesion_dry": "1.50-1.75 N/mm²",
      "shear_adhesion_wet": "1.10-1.35 N/mm²",
      "deformability_s2": "",
      "mixing_ratio": "Grey 1:0.27 / White 1:0.29",
      "coverage": "5-6 m² per 20kg @ 3mm bed",
      "setting_time": "24 hours",
      "adhesive_thickness": "3-12 mm",
      "mixed_density": "1.65 ± 0.05 kg/L",
      "application_temp": "5°C to 35°C",
      "voc_content": "< 2 g/kg (EPA 24)",
      "shelf_life": "12 months",
      "packaging": "20 KG bag",
      "color": "Grey, White",
    },
  },
  {
    code: "K90",
    name: "K90 Paramount Tile & Stone Adhesive",
    isType: "Type 3TS1",
    enClassification: "C2TES1",
    tagline:
      "Highly flexible, deformable — challenging substrates like plywood, gypsum, facades.",
    description:
      "Highly flexible polymer-modified adhesive with superior non-slip properties and high deformability. Engineered for challenging substrates such as plywood, gypsum boards, and facades. Suitable for interior and exterior dry or wet areas, including swimming pools.",
    maxTileSize: "Up to 1200x2400mm",
    applicationAreas: [
      "kitchen",
      "bathroom",
      "outdoor_facade",
      "elevation",
      "swimming_pool",
      "commercial_high_traffic",
    ],
    technicalParams: {
      "open_time": "30-35 minutes",
      "pot_life": "4-5 hours",
      "adjustability_time": "30-35 minutes",
      "tensile_adhesion_is": "≥ 1.0 N/mm²",
      "tensile_adhesion_water": "1.25-1.75 N/mm²",
      "tensile_adhesion_heat": "1.25-1.50 N/mm²",
      "tensile_adhesion_freeze_thaw": "1.50-2.00 N/mm²",
      "slip_resistance": "0.20-0.30 mm",
      "shear_adhesion_dry": "1.75-2.00 N/mm²",
      "shear_adhesion_wet": "1.30-1.55 N/mm²",
      "deformability_s2": "≥ 2.70 mm",
      "mixing_ratio": "Grey 1:0.24-0.26 / White 1:0.25-0.27",
      "coverage": "5-6 m² per 20kg @ 3mm bed",
      "setting_time": "24 hours",
      "adhesive_thickness": "3-12 mm",
      "mixed_density": "1.65-1.85 kg/L",
      "application_temp": "5°C to 35°C",
      "voc_content": "< 1.2 g/kg (EPA 24)",
      "shelf_life": "12 months",
      "packaging": "20 KG bag",
      "color": "Grey, White",
    },
  },
  {
    code: "KX",
    name: "Kamdhenu X — The Ultimate Adhesive",
    isType: "Type 4TS2",
    enClassification: "C2TES2",
    tagline:
      "Highly deformable, extended open time — extra-large slabs, facades, industrial.",
    description:
      "Advanced highly deformable polymer-modified adhesive with extended open time and superior non-slip properties. Designed for heavy and extra-large format tiles or slabs on facades, industrial floors, and areas exposed to extreme thermal variation or vibration.",
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
    technicalParams: {
      "open_time": "Min. 40 minutes",
      "pot_life": "4-4.5 hours",
      "adjustability_time": "~40 minutes",
      "tensile_adhesion_is": "≥ 1.5 N/mm²",
      "tensile_adhesion_water": "1.25-1.35 N/mm²",
      "tensile_adhesion_heat": "≥ 1.5 N/mm²",
      "tensile_adhesion_freeze_thaw": "1.25-1.35 N/mm²",
      "slip_resistance": "0.3-0.4 mm",
      "shear_adhesion_dry": "≥ 1.5 N/mm²",
      "shear_adhesion_wet": "≥ 1.0 N/mm²",
      "deformability_s2": "≥ 3.5 mm",
      "mixing_ratio": "Grey 100:28 / White 100:30",
      "coverage": "5-6 m² per 20kg @ 3mm bed",
      "setting_time": "24 hours",
      "adhesive_thickness": "3-12 mm",
      "mixed_density": "1.6-1.7 kg/L",
      "application_temp": "5°C to 35°C",
      "voc_content": "< 0.2 g/L",
      "shelf_life": "12 months",
      "packaging": "20 KG bag",
      "color": "White",
    },
  },
];

// ============================================================ competitors

type CompetitorProductSeed = readonly [
  name: string,
  isType: string,
  enType: string,
  competesWith: string,
];

type TypeDefaults = Readonly<Record<string, string>>;

const COMPETITOR_CATALOG = [
  {
    name: "MYK Laticrete",
    slug: "myk_laticrete",
    products: [
      ["LATICRETE 303 Floor & Wall Tile Adhesive", "Type 1T", "C1T", "K50"],
      ["LATICRETE 307", "Type 2T", "C1T", "K60"],
      ["LATICRETE 320 Stone Adhesive", "Type 2", "C2TE", "K60"],
      ["LATICRETE 313", "Type 2T", "C1TE", "K60"],
      ["LATICRETE 325 Shear Wall Adhesive", "Type 2T", "C2T", "K80"],
      ["LATICRETE 315 Plus", "Type 2T", "C2TE", "K80"],
      ["LATICRETE 335 Super Flex", "Type 3TS1", "C2TES2", "K90"],
      ["LATICRETE 325 High Flex", "Type 3T", "C2TE", "K90"],
      ["LATICRETE 345 Super Flex", "Type 4TS2", "C2ETS2", "KX"],
      ["LATICRETE 335 Maxi", "Type 4TS1", "C2TES1", "KX"],
      ["DWA 215", "Type 4TS2", "D2TES2", "KX"],
    ],
  },
  {
    name: "Roff (Pidilite)",
    slug: "roff",
    products: [
      ["Roff New Construction Adhesive (NCA)", "Type 1T", "C1T", "K50"],
      ["Roff Tile Bonder", "Type 1", "C1", "K50"],
      ["Roff Non-Skid Adhesive (NSA)", "Type 2T", "C2T", "K60"],
      ["Roff Vitrofix Adhesive", "Type 2T", "C2T", "K60"],
      ["Roff Vitrofix Ultra Adhesive", "Type 3T", "C2TE", "K80"],
      ["Roff Extrofix Adhesive", "Type 3TS1", "C2TES1", "K90"],
      ["Roff Extrofix Ultra Adhesive", "Type 4TS1", "C2TES1 S1", "K90"],
      ["Roff Yogafix Adhesive", "Type 4TS2", "C2TES2", "KX"],
      ["Roff Master Fix Adhesive", "Type 5 S2", "R2T", "KX"],
      ["Roff Vertifix", "Type 5 S2", "R2T", "KX"],
    ],
  },
  {
    name: "Mapei",
    slug: "mapei",
    products: [
      ["KERABOND T", "Type 1T", "C1T", "K50"],
      ["MAPESET IN", "Type 2", "C1", "K50"],
      ["KERASET T", "Type 2T", "C2T", "K60"],
      ["ADESILEX P10", "Type 3T", "C2TE", "K80"],
      ["ADESILEX P9", "Type 3T", "C2TE", "K80"],
      ["KERAFLEX", "Type 3T", "C2TE", "K80"],
      ["KERABOND PLUS", "Type 3", "C2E", "K80"],
      ["KERAFLEX EASY S1 ZERO", "Type 4S1", "C2ES1", "K90"],
      ["KERAFLEX MAXI S1 ZERO", "Type 4TS1", "C2TES1", "K90"],
      ["ULTRALITE S1", "Type 4TS1", "C2TES1", "K90"],
      ["ULTRALITE S2", "Type 4TS2", "C2TES2", "KX"],
      ["ELASTORAPID", "Type 4TS2", "C2FTS2", "KX"],
      ["GRANIRAPID", "Type 4TS1", "C2FTS1", "KX"],
    ],
  },
  {
    name: "Kerakoll",
    slug: "kerakoll",
    products: [
      ["Biotile", "Type 1T", "C1T", "K50"],
      ["Bioflex", "Type 3T", "C2TE", "K80"],
      ["Bioflex S1", "Type 4TS1", "C2TES1", "K90"],
      ["H40 Gel", "Type 4TS1", "C2TES1", "K90"],
      ["Superflex", "Type 5TS2", "C2TES2", "KX"],
    ],
  },
] as const;

const TYPE_DEFAULTS: Readonly<Record<string, TypeDefaults>> = {
  C1T: {
    "Open Time": "20-30 minutes", "Pot Life": "2-3 hours", "Adjustability Time": "10-15 minutes", "Initial Tensile Adhesion (IS)": "≥ 0.5 N/mm²", "Tensile Adhesion after Water Immersion": "0.45-0.55 N/mm²", "Tensile Adhesion after Heat Aging": "0.50-0.60 N/mm²", "Tensile Adhesion after Freeze-Thaw": "0.50-0.55 N/mm²", "Slip Resistance": "≤ 0.5 mm", "Shear Adhesion (Dry)": "1.0-1.2 N/mm²", "Shear Adhesion (Wet)": "0.9-1.1 N/mm²", "Mixing Ratio (powder:water)": "1 : 0.25", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-10 mm", "Mixed Density": "1.6-1.8 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 5 g/kg", "Shelf Life": "9-12 months", Packaging: "20 KG bag", Color: "Grey",
  },
  C1TE: {
    "Open Time": "30 minutes", "Pot Life": "3-4 hours", "Adjustability Time": "20-30 minutes", "Initial Tensile Adhesion (IS)": "≥ 0.5 N/mm²", "Tensile Adhesion after Water Immersion": "0.50-0.60 N/mm²", "Tensile Adhesion after Heat Aging": "0.55-0.65 N/mm²", "Tensile Adhesion after Freeze-Thaw": "0.55-0.65 N/mm²", "Slip Resistance": "≤ 0.5 mm", "Shear Adhesion (Dry)": "1.1-1.3 N/mm²", "Shear Adhesion (Wet)": "1.0-1.2 N/mm²", "Mixing Ratio (powder:water)": "1 : 0.24-0.26", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-10 mm", "Mixed Density": "1.6-1.8 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 4 g/kg", "Shelf Life": "12 months", Packaging: "20 KG bag", Color: "Grey",
  },
  C2T: {
    "Open Time": "30 minutes", "Pot Life": "3-4 hours", "Adjustability Time": "20-30 minutes", "Initial Tensile Adhesion (IS)": "≥ 1.0 N/mm²", "Tensile Adhesion after Water Immersion": "1.0-1.1 N/mm²", "Tensile Adhesion after Heat Aging": "1.0-1.1 N/mm²", "Tensile Adhesion after Freeze-Thaw": "1.0-1.1 N/mm²", "Slip Resistance": "≤ 0.5 mm", "Shear Adhesion (Dry)": "1.3-1.5 N/mm²", "Shear Adhesion (Wet)": "1.0-1.2 N/mm²", "Mixing Ratio (powder:water)": "1 : 0.25", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-12 mm", "Mixed Density": "1.6-1.8 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 3 g/kg", "Shelf Life": "12 months", Packaging: "20 KG bag", Color: "Grey, White",
  },
  C2TE: {
    "Open Time": "30 minutes", "Pot Life": "3-4 hours", "Adjustability Time": "30 minutes", "Initial Tensile Adhesion (IS)": "≥ 1.0 N/mm²", "Tensile Adhesion after Water Immersion": "1.10-1.25 N/mm²", "Tensile Adhesion after Heat Aging": "1.00-1.10 N/mm²", "Tensile Adhesion after Freeze-Thaw": "1.10-1.25 N/mm²", "Slip Resistance": "≤ 0.5 mm", "Shear Adhesion (Dry)": "1.4-1.6 N/mm²", "Shear Adhesion (Wet)": "1.0-1.2 N/mm²", "Mixing Ratio (powder:water)": "1 : 0.25-0.27", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-12 mm", "Mixed Density": "1.6-1.8 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 2 g/kg", "Shelf Life": "12 months", Packaging: "20 KG bag", Color: "Grey, White",
  },
  C2TES1: {
    "Open Time": "30 minutes", "Pot Life": "3-4 hours", "Adjustability Time": "30 minutes", "Initial Tensile Adhesion (IS)": "≥ 1.0 N/mm²", "Tensile Adhesion after Water Immersion": "1.20-1.50 N/mm²", "Tensile Adhesion after Heat Aging": "1.10-1.30 N/mm²", "Tensile Adhesion after Freeze-Thaw": "1.30-1.60 N/mm²", "Slip Resistance": "0.3-0.4 mm", "Shear Adhesion (Dry)": "1.6-1.8 N/mm²", "Shear Adhesion (Wet)": "1.2-1.4 N/mm²", "Transverse Deformation (S1)": "2.5-2.7 mm", "Mixing Ratio (powder:water)": "1 : 0.25-0.28", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-12 mm", "Mixed Density": "1.6-1.8 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 2 g/kg", "Shelf Life": "12 months", Packaging: "20 KG bag", Color: "Grey, White",
  },
  C2TES2: {
    "Open Time": "30-40 minutes", "Pot Life": "3-4 hours", "Adjustability Time": "30-35 minutes", "Initial Tensile Adhesion (IS)": "≥ 1.0 N/mm²", "Tensile Adhesion after Water Immersion": "1.20-1.30 N/mm²", "Tensile Adhesion after Heat Aging": "1.00-1.10 N/mm²", "Tensile Adhesion after Freeze-Thaw": "1.20-1.30 N/mm²", "Slip Resistance": "0.3-0.4 mm", "Shear Adhesion (Dry)": "1.5-1.7 N/mm²", "Shear Adhesion (Wet)": "1.2-1.4 N/mm²", "Deformability (S2)": "≥ 3.0 mm", "Mixing Ratio (powder:water)": "1 : 0.27-0.30", "Coverage": "4-5 m² per 20kg @ 3mm bed", "Setting Time": "24 hours", "Adhesive Thickness": "3-12 mm", "Mixed Density": "1.6-1.7 kg/L", "Application Temp": "5°C to 35°C", "VOC Content": "< 1 g/kg", "Shelf Life": "12 months", Packaging: "20 KG bag", Color: "White",
  },
  R2T: {
    "Open Time": "40-60 minutes", "Pot Life": "30-45 minutes", "Adjustability Time": "30 minutes", "Initial Tensile Adhesion (IS)": "≥ 2.0 N/mm² (Reactive)", "Tensile Adhesion after Water Immersion": "≥ 2.0 N/mm²", "Tensile Adhesion after Heat Aging": "≥ 2.0 N/mm²", "Tensile Adhesion after Freeze-Thaw": "≥ 2.0 N/mm²", "Slip Resistance": "0.2-0.3 mm", "Shear Adhesion (Dry)": "≥ 2.0 N/mm²", "Shear Adhesion (Wet)": "≥ 2.0 N/mm²", "Mixing Ratio (powder:water)": "Two-component (epoxy/PU)", "Coverage": "3-4 m² per 5kg", "Setting Time": "24 hours", "Adhesive Thickness": "1-10 mm", "Mixed Density": "1.5-1.7 kg/L", "Application Temp": "10°C to 30°C", "VOC Content": "< 1 g/kg", "Shelf Life": "12 months", Packaging: "5 KG kit", Color: "Grey, White",
  },
};

const EN_TYPE_PRIORITY = ["C2TES2", "C2TES1", "C2TE", "C2T", "C1TE", "C1T", "R2T"] as const;

function technicalParamsFor(enType: string): TechnicalParams {
  const normalized = enType.toUpperCase().replaceAll(" ", "");
  const matchedType = EN_TYPE_PRIORITY.find((type) => normalized.includes(type));
  const defaults = TYPE_DEFAULTS[matchedType ?? "C2TE"]!;
  const params = emptyParams();

  for (const [key, label] of PARAM_FIELDS) {
    params[key] = defaults[label] ?? null;
  }

  return technicalParamsSchema.parse(params);
}

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
      update: {
        name: substrate.name,
        description: substrate.description,
        sortOrder: index,
      },
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
        description: fields.description,
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
  for (const competitor of COMPETITOR_CATALOG) {
    const existing = await prisma.competitor.findFirst({
      where: { slug: competitor.slug, deletedAt: null },
      select: { id: true },
    });

    const competitorRow = existing
      ? await prisma.competitor.update({
        where: { id: existing.id },
        data: { name: competitor.name, isActive: true },
      })
      : await prisma.competitor.create({
        data: { name: competitor.name, slug: competitor.slug, isActive: true },
      });
    counts.competitors += 1;

    for (const [name, , enClassification, competesWith] of competitor.products as readonly CompetitorProductSeed[]) {
      const existingProduct = await prisma.competitorProduct.findFirst({
        where: { competitorId: competitorRow.id, name, deletedAt: null },
        select: { id: true },
      });
      const productData = {
        competitorId: competitorRow.id,
        name,
        enClassification,
        competesWith,
        technicalParams: technicalParamsFor(enClassification),
        specSource: "manual" as const,
        isActive: true,
      };

      if (existingProduct) {
        await prisma.competitorProduct.update({ where: { id: existingProduct.id }, data: productData });
      } else {
        await prisma.competitorProduct.create({ data: productData });
      }
      counts.competitorProducts += 1;
    }

    logger.info({ competitor: competitor.slug, competitorProducts: competitor.products.length }, "Competitor products seeded");
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

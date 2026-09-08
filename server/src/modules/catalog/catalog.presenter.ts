import type {
  ApplicationArea,
  Competitor,
  CompetitorProduct,
  Product,
  Substrate,
  TileType,
  TileTypeSize,
} from "../../generated/prisma/client.js";
import type { SpecSource } from "../../generated/prisma/enums.js";
import {
  coerceTechnicalParams,
  type TechnicalParams,
} from "../../validation/technicalParams.js";

/**
 * Presenters keep internal columns (deleted_at, created_by, ai_raw_extraction,
 * tds_file_url, timestamps) out of the catalog responses.
 */

export type SubstrateDto = { id: string; name: string; sortOrder: number };

export function toSubstrateDto(row: Substrate): SubstrateDto {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

export type TileTypeDto = {
  id: string;
  name: string;
  category: string | null;
  sortOrder: number;
  sizes: string[];
};

export function toTileTypeDto(
  row: TileType & { sizes: TileTypeSize[] },
): TileTypeDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sortOrder: row.sortOrder,
    sizes: row.sizes.map((size) => size.sizeLabel),
  };
}

export type ApplicationAreaDto = {
  id: string;
  name: string;
  sortOrder: number;
};

export function toApplicationAreaDto(row: ApplicationArea): ApplicationAreaDto {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

export type ProductDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tagline: string | null;
  isType: string | null;
  enClassification: string | null;
  applicationAreas: string[];
  technicalParams: TechnicalParams;
};

export function toProductDto(row: Product): ProductDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    tagline: row.tagline,
    isType: row.isType,
    enClassification: row.enClassification,
    applicationAreas: row.applicationAreas,
    technicalParams: coerceTechnicalParams(row.technicalParams),
  };
}

export type CompetitorProductDto = {
  id: string;
  name: string;
  enClassification: string | null;
  competesWith: string | null;
  /** Tells the UI whether the specs came from a TDS or manual entry (§7). */
  specSource: SpecSource;
  technicalParams: TechnicalParams;
};

export function toCompetitorProductDto(
  row: CompetitorProduct,
): CompetitorProductDto {
  return {
    id: row.id,
    name: row.name,
    enClassification: row.enClassification,
    competesWith: row.competesWith,
    specSource: row.specSource,
    technicalParams: coerceTechnicalParams(row.technicalParams),
  };
}

export type CompetitorDto = {
  id: string;
  name: string;
  slug: string;
  products: CompetitorProductDto[];
};

export function toCompetitorDto(
  row: Competitor & { products: CompetitorProduct[] },
): CompetitorDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    products: row.products.map(toCompetitorProductDto),
  };
}

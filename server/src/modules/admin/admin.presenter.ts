import type {
  Competitor,
  CompetitorProduct,
  Product,
  User,
} from "../../generated/prisma/client.js";
import { coerceTechnicalParams } from "../../validation/technicalParams.js";

/** Admin-facing user row: richer than the RM-facing shape, still no google_sub. */
export function toAdminUserDto(user: User) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    mobileNumber: user.mobileNumber,
    isActive: user.isActive,
    /** Whether a Google identity has been bound (first admin login). */
    googleLinked: user.googleSub !== null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function toAdminProductDto(product: Product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    enClassification: product.enClassification,
    applicationAreas: product.applicationAreas,
    installationSuitability: product.installationSuitability,
    substrateIds: product.substrateIds,
    tileTypeIds: product.tileTypeIds,
    tileSizes: product.tileSizes,
    technicalParams: coerceTechnicalParams(product.technicalParams),
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toAdminCompetitorDto(
  competitor: Competitor & { _count?: { products: number } },
) {
  return {
    id: competitor.id,
    name: competitor.name,
    slug: competitor.slug,
    isActive: competitor.isActive,
    productCount: competitor._count?.products,
    createdAt: competitor.createdAt,
    updatedAt: competitor.updatedAt,
  };
}

export function toAdminCompetitorProductDto(
  row: CompetitorProduct & { competitor?: Competitor },
) {
  return {
    id: row.id,
    competitorId: row.competitorId,
    competitorName: row.competitor?.name,
    name: row.name,
    enClassification: row.enClassification,
    competesWith: row.competesWith,
    specSource: row.specSource,
    tdsFileUrl: row.tdsFileUrl,
    tdsFileName: row.tdsFileName,
    aiModel: row.aiModel,
    isActive: row.isActive,
    technicalParams: coerceTechnicalParams(row.technicalParams),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function paginationMeta(
  page: number,
  pageSize: number,
  total: number,
): { page: number; pageSize: number; total: number; totalPages: number } {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

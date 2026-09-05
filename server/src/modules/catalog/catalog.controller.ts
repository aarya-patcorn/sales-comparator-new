import type { Request, Response } from "express";

import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import {
  toApplicationAreaDto,
  toCompetitorDto,
  toProductDto,
  toSubstrateDto,
  toTileTypeDto,
} from "./catalog.presenter.js";
import {
  listActiveProducts,
  listApplicationAreas,
  listCompetitorsWithProducts,
  listSubstrates,
  listTileTypes,
  substrateExists,
} from "./catalog.service.js";
import { tileTypesQuerySchema } from "./catalog.validation.js";

export async function getSubstrates(
  _req: Request,
  res: Response,
): Promise<void> {
  const rows = await listSubstrates();

  res.status(200).json({ substrates: rows.map(toSubstrateDto) });
}

export async function getTileTypes(
  req: Request,
  res: Response,
): Promise<void> {
  const { substrate_id: substrateId } = parseOrThrow(
    tileTypesQuerySchema,
    req.query,
  );

  if (substrateId !== undefined && !(await substrateExists(substrateId))) {
    // An empty list would hide a bad slug from the client.
    throw HttpError.notFound(`Unknown substrate '${substrateId}'`);
  }

  const rows = await listTileTypes(substrateId);

  res.status(200).json({ tileTypes: rows.map(toTileTypeDto) });
}

export async function getAreas(_req: Request, res: Response): Promise<void> {
  const rows = await listApplicationAreas();

  res.status(200).json({ areas: rows.map(toApplicationAreaDto) });
}

export async function getKamdhenuProducts(
  _req: Request,
  res: Response,
): Promise<void> {
  const rows = await listActiveProducts();

  res.status(200).json({ products: rows.map(toProductDto) });
}

export async function getCompetitors(
  _req: Request,
  res: Response,
): Promise<void> {
  const rows = await listCompetitorsWithProducts();

  res.status(200).json({ competitors: rows.map(toCompetitorDto) });
}

import type { Request, Response } from "express";

import { prisma } from "../../db/client.js";
import { HttpError, parseOrThrow } from "../../middleware/errorHandler.js";
import { omitUndefined } from "../../lib/objects.js";
import { toSkipTake, uuidSchema } from "../../validation/common.js";
import {
  createAdminUserSchema,
  createRmUserSchema,
  listQuerySchema,
  statusSchema,
  updateRmUserSchema,
} from "./admin.validation.js";
import { paginationMeta, toAdminUserDto } from "./admin.presenter.js";

function userId(req: Request): string {
  return parseOrThrow(uuidSchema, req.params.id);
}

async function findUserOr404(id: string, role: "rm" | "admin") {
  const user = await prisma.user.findFirst({ where: { id, role } });

  if (!user) {
    throw HttpError.notFound(`No ${role} user with id '${id}'`);
  }
  return user;
}

/** GET /api/admin/dashboard */
export async function getDashboard(
  _req: Request,
  res: Response,
): Promise<void> {
  const [rmTotal, rmActive, productTotal, productActive] = await Promise.all([
    prisma.user.count({ where: { role: "rm" } }),
    prisma.user.count({ where: { role: "rm", isActive: true } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, isActive: true } }),
  ]);

  res.status(200).json({
    rmUsers: { total: rmTotal, active: rmActive },
    products: { total: productTotal, active: productActive },
  });
}

// ------------------------------------------------------------------ RM users

/** GET /api/admin/users */
export async function listRmUsers(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listQuerySchema, req.query);

  const where = {
    role: "rm" as const,
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { mobileNumber: { contains: query.search } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    users: rows.map(toAdminUserDto),
    pagination: paginationMeta(query.page, query.pageSize, total),
  });
}

/** POST /api/admin/users */
export async function createRmUser(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createRmUserSchema, req.body);

  const existing = await prisma.user.findFirst({
    where: { mobileNumber: input.mobileNumber },
    select: { id: true },
  });

  if (existing) {
    throw new HttpError(
      409,
      "duplicate_mobile_number",
      `A user with mobile number '${input.mobileNumber}' already exists`,
    );
  }

  const user = await prisma.user.create({ data: { ...input, role: "rm" } });

  res.status(201).json({ user: toAdminUserDto(user) });
}

/** PUT /api/admin/users/:id */
export async function updateRmUser(req: Request, res: Response): Promise<void> {
  const id = userId(req);
  const input = parseOrThrow(updateRmUserSchema, req.body);

  await findUserOr404(id, "rm");

  if (input.mobileNumber) {
    const clash = await prisma.user.findFirst({
      where: { mobileNumber: input.mobileNumber, NOT: { id } },
      select: { id: true },
    });

    if (clash) {
      throw new HttpError(
        409,
        "duplicate_mobile_number",
        `A user with mobile number '${input.mobileNumber}' already exists`,
      );
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: omitUndefined(input),
  });

  res.status(200).json({ user: toAdminUserDto(user) });
}

/** PATCH /api/admin/users/:id/status */
export async function setRmUserStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = userId(req);
  const { isActive } = parseOrThrow(statusSchema, req.body);

  await findUserOr404(id, "rm");

  const user = await prisma.user.update({ where: { id }, data: { isActive } });

  // A deactivated RM must lose access immediately, not at token expiry.
  if (!isActive) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  res.status(200).json({ user: toAdminUserDto(user) });
}

/** DELETE /api/admin/users/:id — hard delete; sessions cascade. */
export async function deleteRmUser(req: Request, res: Response): Promise<void> {
  const id = userId(req);

  await findUserOr404(id, "rm");
  await prisma.user.delete({ where: { id } });

  res.status(204).end();
}

// --------------------------------------------------------------- admin users

/** GET /api/admin/admins */
export async function listAdminUsers(
  req: Request,
  res: Response,
): Promise<void> {
  const query = parseOrThrow(listQuerySchema, req.query);

  const where = {
    role: "admin" as const,
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ email: "asc" }],
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    admins: rows.map(toAdminUserDto),
    pagination: paginationMeta(query.page, query.pageSize, total),
  });
}

/**
 * POST /api/admin/admins — adds an email to the allow-list.
 *
 * `google_sub` is left null and is bound on that admin's first Google login
 * (blueprint §5.2); no password is ever stored.
 */
export async function createAdminUser(
  req: Request,
  res: Response,
): Promise<void> {
  const input = parseOrThrow(createAdminUserSchema, req.body);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" }, role: "admin" },
    select: { id: true },
  });

  if (existing) {
    throw new HttpError(
      409,
      "duplicate_admin",
      `'${input.email}' is already an administrator`,
    );
  }

  const user = await prisma.user.create({ data: { ...input, role: "admin" } });

  res.status(201).json({ user: toAdminUserDto(user) });
}

/** PATCH /api/admin/admins/:id/status */
export async function setAdminUserStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const id = userId(req);
  const { isActive } = parseOrThrow(statusSchema, req.body);

  await findUserOr404(id, "admin");

  // Locking yourself out is almost never intended, and the allow-list is the
  // only way back in.
  if (!isActive && req.user?.id === id) {
    throw new HttpError(
      409,
      "cannot_deactivate_self",
      "You cannot deactivate your own administrator account",
    );
  }

  const user = await prisma.user.update({ where: { id }, data: { isActive } });

  if (!isActive) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  res.status(200).json({ user: toAdminUserDto(user) });
}

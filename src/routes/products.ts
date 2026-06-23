import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { VALID_CATEGORIES } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ProductsQueryParams, CursorData, ProductsResponse } from '../types/index.js';
import { Prisma } from '@prisma/client';

export const productRouter = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}_${id}`).toString('base64url');
}

function decodeCursor(raw: string): CursorData {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    const lastUnderscore = decoded.lastIndexOf('_');
    if (lastUnderscore === -1) {
      throw new Error('Invalid cursor format');
    }
    const isoTimestamp = decoded.slice(0, lastUnderscore);
    const id = decoded.slice(lastUnderscore + 1);
    const updatedAt = new Date(isoTimestamp);
    if (isNaN(updatedAt.getTime()) || !id) {
      throw new Error('Invalid cursor data');
    }
    return { updatedAt, id };
  } catch {
    throw new AppError(400, 'Invalid cursor format', 'Cursor must be a valid base64url encoded string');
  }
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = parseInt(raw, 10);
  if (isNaN(limit) || limit < 1) {
    throw new AppError(400, 'Invalid limit', 'Limit must be a positive integer');
  }
  if (limit > MAX_LIMIT) {
    throw new AppError(400, `Limit exceeds maximum`, `Max limit is ${MAX_LIMIT}`);
  }
  return limit;
}

function validateCategory(category: string | undefined): string | undefined {
  if (category === undefined) return undefined;
  const normalized = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  if (!VALID_CATEGORIES.includes(normalized as typeof VALID_CATEGORIES[number])) {
    throw new AppError(
      400,
      `Invalid category`,
      `Valid categories: ${VALID_CATEGORIES.join(', ')}`,
    );
  }
  return normalized;
}

productRouter.get(
  '/',
  async (req: Request<{}, {}, {}, ProductsQueryParams>, res: Response<ProductsResponse>, next: NextFunction) => {
    try {
      const limit = parseLimit(req.query.limit as string | undefined);
      const category = validateCategory(req.query.category as string | undefined);
      const cursor = req.query.cursor;

      const where: Prisma.ProductWhereInput = {};

      if (category) {
        where.category = category;
      }

      if (cursor) {
        const { updatedAt, id } = decodeCursor(cursor);
        where.OR = [
          { updatedAt: { lt: updatedAt } },
          { updatedAt: updatedAt, id: { lt: id } },
        ];
      }

      const products = await prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          name: true,
          category: true,
          price: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const hasMore = products.length > limit;
      const results = hasMore ? products.slice(0, limit) : products;

      let nextCursor: string | null = null;
      if (hasMore && results.length > 0) {
        const last = results[results.length - 1];
        nextCursor = encodeCursor(last.updatedAt, last.id);
      }

      res.json({
        products: results.map((p) => ({
          ...p,
          price: Number(p.price),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        nextCursor,
      });
    } catch (err) {
      next(err);
    }
  },
);

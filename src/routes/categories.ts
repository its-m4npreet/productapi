import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const categoryRouter = Router();

categoryRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.product.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  const categories = rows.map((r) => r.category);
  res.json({ categories, count: categories.length });
});

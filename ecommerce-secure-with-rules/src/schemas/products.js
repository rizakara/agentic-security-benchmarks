import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).default(""),
  price_cents: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  price_cents: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
});

export const productListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

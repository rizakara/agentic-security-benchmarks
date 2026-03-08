import { z } from "zod";

export const addToCartSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
});

export const cartItemParamSchema = z.object({
  itemId: z.string().uuid(),
});

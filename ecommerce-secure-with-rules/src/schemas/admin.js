import { z } from "zod";

export const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const orderListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]).optional(),
});

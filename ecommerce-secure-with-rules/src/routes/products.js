import { Router } from "express";
import path from "path";
import pool from "../config/db.js";
import { authenticate, verifyTokenVersion, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { uploadSingle, validateAndSaveFile } from "../middleware/upload.js";
import {
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
  productIdParamSchema,
} from "../schemas/products.js";

const router = Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// GET /products — public, cursor-based pagination
router.get("/", validate(productListQuerySchema, "query"), async (req, res) => {
  const { cursor, limit, search } = req.query;
  const params = [];
  const conditions = ["deleted_at IS NULL"];

  if (cursor) {
    params.push(cursor);
    conditions.push(`id < $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  params.push(limit);
  const sql = `
    SELECT id, name, description, price_cents, stock, image_path, created_at
    FROM products
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(sql, params);
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

  res.json({ products: rows, nextCursor });
});

// GET /products/:id — public
router.get("/:id", validate(productIdParamSchema, "params"), async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, description, price_cents, stock, image_path, created_at FROM products WHERE id = $1 AND deleted_at IS NULL",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Product not found" });
  res.json(rows[0]);
});

// POST /products — admin only
router.post(
  "/",
  authenticate,
  verifyTokenVersion,
  requireRole("admin"),
  uploadSingle,
  validateAndSaveFile,
  async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description, price_cents, stock } = parsed.data;
    const imagePath = req.savedFile ? req.savedFile.filename : null;

    const { rows } = await pool.query(
      `INSERT INTO products (name, description, price_cents, stock, image_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, price_cents, stock, image_path, created_at`,
      [name, description, price_cents, stock, imagePath]
    );

    res.status(201).json(rows[0]);
  }
);

// PATCH /products/:id — admin only
router.patch(
  "/:id",
  authenticate,
  verifyTokenVersion,
  requireRole("admin"),
  uploadSingle,
  validateAndSaveFile,
  validate(productIdParamSchema, "params"),
  async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const fields = { ...parsed.data };
    if (req.savedFile) fields.image_path = req.savedFile.filename;

    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      values.push(value);
      setClauses.push(`${key} = $${values.length}`);
    }

    if (!setClauses.length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE products SET ${setClauses.join(", ")}
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING id, name, description, price_cents, stock, image_path, created_at`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(rows[0]);
  }
);

// DELETE /products/:id — admin, soft delete
router.delete(
  "/:id",
  authenticate,
  verifyTokenVersion,
  requireRole("admin"),
  validate(productIdParamSchema, "params"),
  async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product deleted" });
  }
);

// GET /products/:id/image — serve with safe headers
router.get(
  "/:id/image",
  validate(productIdParamSchema, "params"),
  async (req, res) => {
    const { rows } = await pool.query(
      "SELECT image_path FROM products WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!rows.length || !rows[0].image_path) {
      return res.status(404).json({ error: "Image not found" });
    }

    const filePath = path.resolve(UPLOAD_DIR, rows[0].image_path);
    res.set("Content-Disposition", "attachment");
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(filePath);
  }
);

export default router;

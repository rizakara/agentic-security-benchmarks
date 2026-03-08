/**
 * Express middleware that validates req.body (or other source) against a Zod schema.
 * @param {import("zod").ZodSchema} schema
 * @param {"body"|"query"|"params"} source
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }
    req[source] = result.data;
    next();
  };
}

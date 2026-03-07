function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value === undefined || value === null) continue;
      if (rules.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`${field} must be a valid email`);
      }
      if (rules.type === 'number' && (typeof value !== 'number' || isNaN(value))) {
        errors.push(`${field} must be a number`);
      }
      if (rules.min !== undefined && typeof value === 'string' && value.length < rules.min) {
        errors.push(`${field} must be at least ${rules.min} characters`);
      }
      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
    }
    if (errors.length) return res.status(400).json({ errors });
    next();
  };
}

module.exports = validate;

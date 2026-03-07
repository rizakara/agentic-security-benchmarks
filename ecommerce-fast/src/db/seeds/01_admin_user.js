const bcrypt = require('bcrypt');

exports.seed = async function (knex) {
  const existing = await knex('users').where('email', 'admin@example.com').first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('admin123', 12);
  await knex('users').insert({
    email: 'admin@example.com',
    password_hash: passwordHash,
    name: 'Admin',
    role: 'admin',
  });
};

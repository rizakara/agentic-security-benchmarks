const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/models/db');

async function seed() {
  console.log('Running migrations...');
  await db.migrate.latest();

  console.log('Seeding database...');

  // Create admin user
  const adminExists = await db('users').where({ email: 'admin@example.com' }).first();
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin123!', 12);
    await db('users').insert({
      email: 'admin@example.com',
      password_hash: hash,
      name: 'Admin',
      role: 'admin',
    });
    console.log('Admin user created: admin@example.com / Admin123!');
  }

  // Create sample products
  const productCount = await db('products').count().first();
  if (parseInt(productCount.count, 10) === 0) {
    await db('products').insert([
      { name: 'Wireless Headphones', description: 'Premium noise-cancelling wireless headphones', price: 79.99, stock: 50, category: 'electronics' },
      { name: 'Cotton T-Shirt', description: 'Comfortable 100% cotton t-shirt', price: 24.99, stock: 200, category: 'clothing' },
      { name: 'Running Shoes', description: 'Lightweight running shoes with cushioned sole', price: 119.99, stock: 75, category: 'footwear' },
      { name: 'Stainless Water Bottle', description: 'Double-wall insulated 32oz water bottle', price: 29.99, stock: 150, category: 'accessories' },
      { name: 'Laptop Stand', description: 'Adjustable aluminum laptop stand', price: 49.99, stock: 100, category: 'electronics' },
    ]);
    console.log('Sample products created');
  }

  console.log('Seed complete');
  await db.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

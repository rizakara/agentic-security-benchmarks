exports.up = async function (knex) {
  // Users
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('name', 255).notNullable();
    t.enum('role', ['customer', 'admin']).notNullable().defaultTo('customer');
    t.timestamps(true, true);
  });

  // Products
  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('name', 255).notNullable();
    t.text('description');
    t.decimal('price', 10, 2).notNullable();
    t.integer('stock').notNullable().defaultTo(0);
    t.string('image_url', 500);
    t.string('category', 100);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Cart items
  await knex.schema.createTable('cart_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.integer('quantity').notNullable().defaultTo(1);
    t.timestamps(true, true);
    t.unique(['user_id', 'product_id']);
  });

  // Orders
  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.decimal('total', 10, 2).notNullable();
    t.enum('status', ['pending', 'paid', 'shipped', 'delivered', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    t.string('stripe_payment_intent_id', 255);
    t.jsonb('shipping_address');
    t.timestamps(true, true);
  });

  // Order items
  await knex.schema.createTable('order_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('SET NULL');
    t.string('product_name', 255).notNullable();
    t.decimal('price', 10, 2).notNullable();
    t.integer('quantity').notNullable();
    t.timestamps(true, true);
  });

  // Indexes for performance
  await knex.schema.raw('CREATE INDEX idx_products_category ON products (category)');
  await knex.schema.raw('CREATE INDEX idx_products_active ON products (active) WHERE active = true');
  await knex.schema.raw('CREATE INDEX idx_orders_user_id ON orders (user_id)');
  await knex.schema.raw('CREATE INDEX idx_orders_status ON orders (status)');
  await knex.schema.raw('CREATE INDEX idx_cart_items_user_id ON cart_items (user_id)');
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('users');
};

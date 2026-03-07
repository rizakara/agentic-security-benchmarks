exports.up = async function (knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255).notNullable();
    table.enum('role', ['customer', 'admin']).notNullable().defaultTo('customer');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('products', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.integer('stock').notNullable().defaultTo(0);
    table.string('image_url', 512);
    table.string('category', 100);
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('carts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamps(true, true);
    table.unique('user_id');
  });

  await knex.schema.createTable('cart_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('cart_id').notNullable().references('id').inTable('carts').onDelete('CASCADE');
    table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.integer('quantity').notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.unique(['cart_id', 'product_id']);
  });

  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('SET NULL');
    table
      .enum('status', ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'])
      .notNullable()
      .defaultTo('pending');
    table.decimal('total', 10, 2).notNullable();
    table.string('stripe_payment_intent_id', 255);
    table.jsonb('shipping_address');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('SET NULL');
    table.integer('quantity').notNullable();
    table.decimal('price_at_purchase', 10, 2).notNullable();
    table.timestamps(true, true);
  });

  // Indexes for common queries
  await knex.schema.raw('CREATE INDEX idx_products_category ON products(category)');
  await knex.schema.raw('CREATE INDEX idx_products_active ON products(active)');
  await knex.schema.raw('CREATE INDEX idx_orders_user_id ON orders(user_id)');
  await knex.schema.raw('CREATE INDEX idx_orders_status ON orders(status)');
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('cart_items');
  await knex.schema.dropTableIfExists('carts');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('users');
};

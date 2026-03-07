const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./models/db');

async function start() {
  try {
    // Verify database connection
    await db.raw('SELECT 1');
    logger.info('Database connected');

    // Run pending migrations
    await db.migrate.latest();
    logger.info('Migrations up to date');

    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} [${config.env}]`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await db.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  await db.destroy();
  process.exit(0);
});

start();

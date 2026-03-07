const config = require('../config');

module.exports = {
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
  },
  pool: { min: 2, max: 20 },
  migrations: {
    directory: './migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

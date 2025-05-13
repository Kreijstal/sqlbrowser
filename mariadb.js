const mariadb = require('mariadb');

/**
 * Parses a MySQL connection URI and creates a MariaDB connection pool.
 *
 * @param {string} mysqlUri - The MySQL connection URI (e.g., "mysql://user:password@host:port/database").
 * @returns {mariadb.Pool} A MariaDB connection pool instance.
 * @throws {Error} If the URI is invalid or missing required components.
 */
function parseMySqlUriAndCreatePool(mysqlUri) {
  if (!mysqlUri || typeof mysqlUri !== 'string') {
    throw new Error('Invalid MySQL URI provided.');
  }

  try {
    // The standard URL parser works well for mysql:// URIs
    const url = new URL(mysqlUri);

    if (url.protocol !== 'mysql:') {
      throw new Error('Invalid protocol. URI must start with mysql://');
    }

    const poolOptions = {
      host: url.hostname || 'localhost', // Default host if not specified
      port: url.port ? parseInt(url.port, 10) : 3306, // Default port if not specified
      user: url.username,
      password: url.password,
      // Remove leading '/' from pathname to get the database name
      database: url.pathname ? url.pathname.substring(1) : undefined,
      // You might want to add other pool options here, like:
      connectionLimit: 5,
      // acquireTimeout: 30000,
      // idleTimeout: 30000,
    };

    // Validate essential components
    if (!poolOptions.user) {
        console.warn('Warning: No user specified in the MySQL URI.');
        // Depending on your setup, you might want to throw an error here
        // throw new Error('User is required in the MySQL URI.');
    }
     if (!poolOptions.database) {
        console.warn('Warning: No database specified in the MySQL URI.');
        // Depending on your setup, you might want to throw an error here
        // throw new Error('Database is required in the MySQL URI.');
    }


    //console.log('Creating MariaDB pool with options:', poolOptions);

    // Create and return pool with database name
    const pool = mariadb.createPool(poolOptions);
    return {
        pool,
        database: poolOptions.database
    };

  } catch (error) {
    console.error('Failed to parse MySQL URI or create pool:', error);
    // Re-throw or handle the error as appropriate for your application
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        throw new Error(`Invalid MySQL URI format: ${mysqlUri}`);
    }
    throw error;
  }
}

module.exports = { parseMySqlUriAndCreatePool };

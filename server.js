// server.js
const express = require('express');
const { parseMySqlUriAndCreatePool } = require('./mariadb');

/**
 * Creates and starts the Express server as a REST API.
 *
 * @param {string} dbUri - The MariaDB/MySQL connection URI.
 * @param {number} [port=3000] - The port number to listen on.
 */
async function startServer(dbUri, port = 3000) {
  let pool, dbName;
  try {
    const result = parseMySqlUriAndCreatePool(dbUri);
    pool = result.pool;
    dbName = result.database;
    // Test connection (optional but recommended)
    const conn = await pool.getConnection();
    await conn.release();
  } catch (error) {
    console.error(`FATAL: Could not connect to the database. Error: ${error.message}`);
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // --- API Routes ---

  // GET /api - API root endpoint
  app.get('/api', (req, res) => {
    res.json({
      api: 'SQL Browser REST API',
      version: '1.0',
      endpoints: {
        tables: '/api/tables',
        tableData: '/api/tables/:tableName'
      },
      database: dbName
    });
  });

  // GET /api/tables - List all tables
  app.get('/api/tables', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const tablesResult = await conn.query('SHOW TABLES');
      const tables = tablesResult.map(row => Object.values(row)[0]);
      res.json({ success: true, dbName, tables });
    } catch (err) {
      console.error('Error fetching tables:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      if (conn) await conn.release();
    }
  });

  // GET /api/tables/:tableName - Get table data
  app.get('/api/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Validate table exists
      const tablesResult = await conn.query('SHOW TABLES');
      const allTables = tablesResult.map(row => Object.values(row)[0]);
      
      if (!allTables.includes(tableName)) {
        return res.status(404).json({
          success: false,
          error: `Table '${tableName}' not found`
        });
      }

      const rows = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT 100`);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      
      res.json({
        success: true,
        tableName,
        dbName,
        columns,
        data: rows
      });
    } catch (err) {
      console.error(`Error fetching table ${tableName}:`, err);
      res.status(500).json({
        success: false,
        error: err.message
      });
    } finally {
      if (conn) await conn.release();
    }
  });

  // --- Start Server ---
  app.listen(port, () => {
    console.log(`🚀 REST API running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log(`- GET /api - API information`);
    console.log(`- GET /api/tables - List all tables`);
    console.log(`- GET /api/tables/:tableName - Get table data`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    if (pool) await pool.end();
    process.exit(0);
  });
}

module.exports = { startServer };

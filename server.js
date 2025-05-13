// server.js
const express = require('express');
const { parseMySqlUriAndCreatePool } = require('./mariadb');
const { Serializer } = require('jsonapi-serializer');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger/OpenAPI configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SQL Browser JSON:API',
      version: '1.0.0',
      description: 'A JSON:API compliant interface for browsing SQL databases',
    },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      responses: {
        JsonApiError: {
          description: 'Standard JSON:API error response',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        title: { type: 'string' },
                        detail: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./server.js'], // files containing annotations
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Creates and starts the Express server as a JSON:API compliant API.
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
  
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // --- API Routes ---

  /**
   * @openapi
   * /api:
   *   get:
   *     summary: Get API information
   *     description: Returns basic information about the API and available endpoints
   *     responses:
   *       200:
   *         description: API information
   *         content:
   *           application/vnd.api+json:
   *             schema:
   *               $ref: '#/components/schemas/ApiInfo'
   */
  // GET /api - API root endpoint
  app.get('/api', (req, res) => {
    const serializer = new Serializer('api-info', {
      attributes: ['api', 'version', 'endpoints', 'database'],
      endpoints: {
        attributes: ['tables', 'tableData']
      }
    });

    res.json(serializer.serialize({
      id: 'root',
      api: 'SQL Browser JSON:API',
      version: '1.0',
      endpoints: {
        tables: '/api/tables',
        tableData: '/api/tables/:tableName'
      },
      database: dbName
    }));
  });

  /**
   * @openapi
   * /api/tables:
   *   get:
   *     summary: List all tables
   *     description: Returns a list of all tables in the connected database
   *     responses:
   *       200:
   *         description: List of tables
   *         content:
   *           application/vnd.api+json:
   *             schema:
   *               $ref: '#/components/schemas/TableList'
   *       500:
   *         $ref: '#/components/responses/JsonApiError'
   */
  // GET /api/tables - List all tables
  app.get('/api/tables', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const tablesResult = await conn.query('SHOW TABLES');
      const tables = tablesResult.map(row => Object.values(row)[0]);
      
      const serializer = new Serializer('table', {
        attributes: ['name'],
        keyForAttribute: 'camelCase'
      });

      res.json(serializer.serialize(tables.map(name => ({
        id: name,
        name
      }))));
    } catch (err) {
      console.error('Error fetching tables:', err);
      res.status(500).json({
        errors: [{
          status: '500',
          title: 'Database Error',
          detail: err.message
        }]
      });
    } finally {
      if (conn) await conn.release();
    }
  });

  /**
   * @openapi
   * /api/tables/{tableName}:
   *   get:
   *     summary: Get table data
   *     description: Returns data from the specified table with pagination
   *     parameters:
   *       - in: path
   *         name: tableName
   *         required: true
   *         schema:
   *           type: string
   *         description: Name of the table to query
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Number of items per page (or 'all' for all records)
   *     responses:
   *       200:
   *         description: Table data in JSON:API format
   *         content:
   *           application/vnd.api+json:
   *             schema:
   *               $ref: '#/components/schemas/TableData'
   *       404:
   *         $ref: '#/components/responses/JsonApiError'
   *       500:
   *         $ref: '#/components/responses/JsonApiError'
   */
  // GET /api/tables/:tableName - Get table data
  app.get('/api/tables/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const { page = 1, limit = 50 } = req.query;
    let conn;
    try {
      conn = await pool.getConnection();
      
      // Validate table exists
      const tablesResult = await conn.query('SHOW TABLES');
      const allTables = tablesResult.map(row => Object.values(row)[0]);
      
      if (!allTables.includes(tableName)) {
        return res.status(404).json({
          errors: [{
            status: '404',
            title: 'Not Found',
            detail: `Table '${tableName}' not found`
          }]
        });
      }

      // Get total count for pagination metadata
      const countResult = await conn.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
      const total = countResult[0].total;

      let query = `SELECT * FROM \`${tableName}\``;
      let rows;
      
      if (limit !== 'all') {
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ` LIMIT ${offset}, ${limit}`;
        rows = await conn.query(query);
      } else {
        rows = await conn.query(query);
      }

      // Convert rows to JSON:API format
      const serializer = new Serializer(tableName, {
        attributes: rows.length > 0 ? Object.keys(rows[0]) : [],
        keyForAttribute: 'camelCase',
        meta: {
          tableName,
          dbName,
          pagination: {
            page: parseInt(page),
            limit: limit === 'all' ? total : parseInt(limit),
            total,
            pages: limit === 'all' ? 1 : Math.ceil(total / parseInt(limit))
          }
        }
      });

      res.json(serializer.serialize(rows));
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
    console.log(`🚀 JSON:API running at http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log(`- GET /api - API information`);
    console.log(`- GET /api/tables - List all tables (JSON:API format)`);
    console.log(`- GET /api/tables/:tableName - Get table data (JSON:API format)`);
    console.log(`  Parameters: page (default:1), limit (default:50 or 'all' for all records)`);
    console.log(`- GET /api-docs - Interactive API documentation`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    if (pool) await pool.end();
    process.exit(0);
  });
}

module.exports = { startServer };

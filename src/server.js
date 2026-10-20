require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Check DB Connection
    await prisma.$connect();
    console.log('✅ Connected to MySQL Database (via Prisma & XAMPP)');

    app.listen(PORT, () => {
      console.log(`🚀 Target Batch Backend Server is running on port ${PORT}`);
      console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('❌ Failed to connect to MySQL Database:', error.message);
    console.error('👉 Make sure XAMPP Apache and MySQL are running and target_batch_db is created!');
    process.exit(1);
  }
}

startServer();

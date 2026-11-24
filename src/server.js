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
      startKeepAlive();
    });
  } catch (error) {
    console.error('❌ Failed to connect to MySQL Database:', error.message);
    console.error('👉 Make sure XAMPP Apache and MySQL are running and target_batch_db is created!');
    process.exit(1);
  }
}

// Render's free plan puts the server to sleep after ~15 min without traffic, and the next
// visitor then waits 30-60s. Render sets RENDER_EXTERNAL_URL automatically, so on Render
// the server pings its own public /health URL every 10 minutes to stay awake.
// Set KEEP_ALIVE=false in the Render environment to switch this off.
function startKeepAlive() {
  const publicUrl = process.env.RENDER_EXTERNAL_URL;
  if (!publicUrl || process.env.KEEP_ALIVE === 'false') return;

  const ping = () =>
    fetch(`${publicUrl}/health`).catch((err) => console.warn('Keep-alive ping failed:', err.message));
  setInterval(ping, 10 * 60 * 1000);
  console.log(`⏰ Keep-alive enabled: pinging ${publicUrl}/health every 10 minutes`);
}

startServer();

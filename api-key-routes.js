const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const router = express.Router();
const ENV_PATH = path.resolve(__dirname, '.env');

dotenv.config({ path: ENV_PATH });

// Helper to update .env file
function updateEnvFile(key, value) {
  let envConfig = {};
  if (fs.existsSync(ENV_PATH)) {
    envConfig = dotenv.parse(fs.readFileSync(ENV_PATH));
  }
  envConfig[key] = value;
  const newEnv = Object.entries(envConfig)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(ENV_PATH, newEnv);
}

// POST /api/update-api-key
router.post('/api/update-api-key', express.json(), (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid apiKey' });
  }
  try {
    updateEnvFile('OPENROUTER_API_KEY', apiKey);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update .env file' });
  }
});

module.exports = router;

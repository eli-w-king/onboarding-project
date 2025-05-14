// Simple port redirection server
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');

const OLD_PORT = 3002;  // Port that clients are trying to connect to
const NEW_PORT = 3030;  // Port where the actual server is running

const app = express();

// Parse JSON for specific endpoints
app.use('/api/update-api-key', bodyParser.json());
app.use('/llm-agent', bodyParser.json());

// Set up proxy for all requests
app.use('/', createProxyMiddleware({
  target: `http://localhost:${NEW_PORT}`,
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    // Log the request
    console.log(`Proxying ${req.method} ${req.url} to http://localhost:${NEW_PORT}${req.url}`);
    
    // For POST requests with a body, handle JSON
    if (req.method === 'POST' && req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Received response from target for ${req.method} ${req.url}: Status ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({
      status: 'error',
      message: 'Proxy error',
      error: err.message
    });
  }
}));

// Start the server
app.listen(OLD_PORT, () => {
  console.log(`Port redirector running at http://localhost:${OLD_PORT}`);
  console.log(`Redirecting requests to http://localhost:${NEW_PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down port redirector...');
  process.exit(0);
});

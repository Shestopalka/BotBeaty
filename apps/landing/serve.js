// Сервер сайту-лендингу BeatyBOTI (локально: node apps/landing/serve.js; на Railway — через Dockerfile).
// Сайт — один index.html з hash-навігацією, тож на будь-який GET віддаємо саме його.
const http = require('http'), fs = require('fs'), path = require('path');
const port = +process.env.PORT || 4173;
const file = path.join(__dirname, 'index.html');

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); return res.end('Server error'); }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '0.0.0.0', () => console.log(`Landing: http://localhost:${port}`));

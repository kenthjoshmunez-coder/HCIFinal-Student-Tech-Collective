const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const port = process.env.PORT || 8080;
const rootDir = __dirname;

const contentTypes = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let filePath = path.normalize(decodeURIComponent(parsed.pathname));

  if (filePath === path.sep) {
    filePath = "index.html";
  }

  const absolutePath = path.join(rootDir, filePath);
  if (!absolutePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("403 Forbidden");
  }

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 Not Found");
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(absolutePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});

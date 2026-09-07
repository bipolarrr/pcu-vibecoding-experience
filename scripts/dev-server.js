import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function inside(root, path) {
  const name = relative(root, path);
  return name !== ".." && !name.startsWith(`..${sep}`) && !isAbsolute(name);
}

export async function startDevServer({ rootDir = repositoryRoot, port = 5173 } = {}) {
  const root = await realpath(rootDir);
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status, message) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : message);
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      reply(405, "Method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
      reply(400, "Invalid URL");
      return;
    }
    if (pathname.includes("\0") || pathname.includes("\\")) {
      reply(400, "Invalid path");
      return;
    }
    const parts = pathname.split("/").filter(Boolean);
    if (parts.some((part, index) => part.startsWith(".")
      && !(index === 0 && part === ".showcase" && parts[1] === "packs"))) {
      reply(403, "Forbidden");
      return;
    }
    const target = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!inside(root, target)) {
      reply(403, "Forbidden");
      return;
    }
    try {
      const file = await realpath(target);
      if (!inside(root, file)) {
        reply(403, "Forbidden");
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Content-Length": body.length,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      // Editors and reset can replace files while a request is in progress.
      const missing = ["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code);
      const denied = ["EACCES", "EPERM", "EBUSY"].includes(error.code);
      reply(missing ? 404 : denied ? 503 : 500, missing ? "Not found" : "File unavailable; retry after saving");
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      accept();
    });
  });
  return server;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) {
    throw new Error("사용법: npm run dev [-- --port 5174]");
  }
  const port = args.length ? Number(args[1]) : 5173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("포트는 1~65535 범위로 지정한다.");
  const server = await startDevServer({ port });
  console.log(`게임 서버 실행: http://127.0.0.1:${server.address().port}`);
  console.log("코드 변경 후 브라우저를 새로고침한다. 종료: Ctrl+C");
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.code === "EADDRINUSE"
      ? "포트 사용 중. 기존 서버를 사용하거나 npm run dev -- --port 5174로 실행한다."
      : `게임 서버 실행 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

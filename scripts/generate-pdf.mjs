import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUTPUT_DIR = join(ROOT, "dist");
const OUTPUT_FILE = join(OUTPUT_DIR, "WendiGo-Presentation.pdf");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const PRINT_CSS = `
  @page {
    size: 1280px 720px;
    margin: 0;
  }

  body {
    overflow: visible !important;
    height: auto !important;
    display: block !important;
    background: #1e293b !important;
  }

  #presentation-area {
    position: static !important;
    width: 1280px !important;
    height: auto !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }

  .slide-container {
    display: flex !important;
    opacity: 1 !important;
    position: relative !important;
    inset: unset !important;
    width: 1280px !important;
    height: 720px !important;
    page-break-after: always;
    break-after: page;
    overflow: hidden !important;
  }

  .slide-container.bleed-image-layout {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    padding: 0 !important;
  }

  .bleed-text-side {
    height: 720px !important;
  }

  .bleed-image-side {
    width: 100% !important;
    height: 720px !important;
    object-fit: cover !important;
  }

  .slide-container:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .controls,
  .presentation-timer {
    display: none !important;
  }
`;

function createStaticServer(root) {
  return createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const filePath = join(root, pathname === "/" ? "index.html" : pathname.replace(/^\//, ""));

    try {
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(port);
    });
    server.on("error", reject);
  });
}

async function main() {
  const server = createStaticServer(ROOT);
  const port = await listen(server);

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/index.html`, {
        waitUntil: "networkidle0",
        timeout: 120_000,
      });
      await page.evaluateHandle("document.fonts.ready");
      await page.addStyleTag({ content: PRINT_CSS });
      await page.emulateMediaType("print");

      await page.pdf({
        path: OUTPUT_FILE,
        width: "1280px",
        height: "720px",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      console.log(`PDF généré : ${OUTPUT_FILE}`);
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

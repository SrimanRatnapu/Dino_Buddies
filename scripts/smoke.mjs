// Hits the running server. Usage: npm run smoke [-- path/to/photo.jpg] [-- --base=http://localhost:3000]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3000").slice(7);
const imgPath = args.find((a) => !a.startsWith("--"));

// 1x1 white JPEG, enough for mock mode and validation tests.
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const image = imgPath ? readFileSync(imgPath).toString("base64") : TINY_JPEG;

async function post(path, body) {
  const t = Date.now();
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  const out = type.includes("json") ? await res.json() : `<${type} ${(await res.arrayBuffer()).byteLength} bytes>`;
  console.log(`\nPOST ${path} -> ${res.status} in ${Date.now() - t}ms ${res.headers.get("x-model") ?? ""}`);
  console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  return out;
}

console.log("health:", await (await fetch(base + "/api/health")).json());
const first = await post("/api/describe", { image, mode: "default" });
if (first.subject) {
  await post("/api/describe", {
    image,
    mode: "default",
    question: "How big is it?",
    previous: { subject: first.subject, description: first.description },
  });
}
await post("/api/describe", { mode: "default" }); // expect 400
await post("/api/speak", { text: "Looking now." });

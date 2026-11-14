// Lists Gemini models this key can call with generateContent.
// Usage: GEMINI_API_KEY=... npm run models
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("Set GEMINI_API_KEY first.");
  process.exit(1);
}
let url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const rows = [];
for (let page = 0; page < 5 && url; page++) {
  const res = await fetch(url, { headers: { "x-goog-api-key": key } });
  if (!res.ok) {
    console.error(res.status, await res.text());
    process.exit(1);
  }
  const json = await res.json();
  for (const m of json.models ?? []) {
    if ((m.supportedGenerationMethods ?? []).includes("generateContent")) {
      rows.push(`${m.name.replace("models/", "").padEnd(42)} ${m.displayName ?? ""}`);
    }
  }
  url = json.nextPageToken
    ? `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=${json.nextPageToken}`
    : "";
}
console.log(rows.filter((r) => /flash|pro/i.test(r)).join("\n"));

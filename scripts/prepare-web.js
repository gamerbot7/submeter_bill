// Copies the offline OCR engine (Tesseract.js), English digits model and jsPDF from node_modules into www/vendor
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const nm = p => path.join(root, "node_modules", p);
const out = p => path.join(root, "www", "vendor", p);
const mk = d => fs.mkdirSync(d, { recursive: true });
const cp = (a, b) => { mk(path.dirname(b)); fs.copyFileSync(a, b); console.log("copied", path.relative(root, b)); };

function walk(dir, hit = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, hit); else hit.push(p);
  }
  return hit;
}

cp(nm("tesseract.js/dist/worker.min.js"), out("tesseract/worker.min.js"));
cp(nm("tesseract.js/dist/tesseract.min.js"), out("tesseract/tesseract.min.js"));

const coreDir = nm("tesseract.js-core");
const cores = fs.readdirSync(coreDir).filter(f => /lstm/.test(f) && /\.js$/.test(f));
if (!cores.length) throw new Error("No tesseract core files found");
cores.forEach(f => cp(path.join(coreDir, f), out("tesseract/core/" + f)));

const langs = walk(nm("@tesseract.js-data/eng")).filter(p => p.endsWith("eng.traineddata.gz"));
if (!langs.length) throw new Error("eng.traineddata.gz not found in @tesseract.js-data/eng");
const pick = langs.find(p => p.includes("best_int")) || langs[0];
cp(pick, out("tesseract/lang/eng.traineddata.gz"));

cp(nm("jspdf/dist/jspdf.umd.min.js"), out("jspdf.umd.min.js"));
console.log("Web vendor files ready.");

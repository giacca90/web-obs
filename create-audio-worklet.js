import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// --- resolver rutas absolutas ---
const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = resolve(__dirname, "scripts/audio-processor.worklet.js");
const outputPath = resolve(__dirname, "projects/web-obs/src/lib/editor-webcam/audio-processor.ts");
// --- leer el código JS ---
const code = readFileSync(inputPath, "utf8");

// --- convertir a string seguro ---
const escaped = JSON.stringify(code);

// --- escribir el .ts generado ---
writeFileSync(outputPath, `// ⚙️ Archivo autogenerado, no editar manualmente\nexport const AUDIO_PROCESSOR = ${escaped};\n`);

console.log(`✅ Generado: ${outputPath}`);

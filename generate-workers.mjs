import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser"; // 👈 Asegúrate de tenerlo instalado: npm i terser -D

// --- resolver rutas absolutas ---
const __dirname = dirname(fileURLToPath(import.meta.url));

const scriptsDir = resolve(__dirname, "scripts");
const outputDir = resolve(__dirname, "projects/web-obs/src/lib/editor-webcam");

// --- función de log con color ---
const log = {
  info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warn: (msg) => console.warn(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error: (msg) => console.error(`\x1b[31m❌ ${msg}\x1b[0m`),
};

(async () => {
  try {
    // --- verificar carpetas ---
    if (!existsSync(scriptsDir)) {
      log.error(`No se encuentra el directorio de scripts: ${scriptsDir}`);
      process.exit(1);
    }

    if (!existsSync(outputDir)) {
      log.warn(`El directorio de salida no existe, creando: ${outputDir}`);
      mkdirSync(outputDir, { recursive: true });
    }

    // --- buscar todos los archivos .worklet.js o .worker.js ---
    const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".worklet.js") || f.endsWith(".worker.js"));

    if (files.length === 0) {
      log.warn(`No se encontraron archivos .worklet.js o .worker.js en: ${scriptsDir}`);
      process.exit(0);
    }

    let processed = 0;

    for (const file of files) {
      try {
        const inputPath = resolve(scriptsDir, file);

        // eliminar los sufijos .worklet o .worker antes de .js
        const baseNameRaw = basename(file, ".js");
        const cleanName = baseNameRaw.replace(/(\.worklet|\.worker)$/i, "");
        const constName = cleanName.toUpperCase().replaceAll(/[- ]+/g, "_");

        const outputPath = resolve(outputDir, `${cleanName}.ts`);

        // --- leer código fuente ---
        const code = readFileSync(inputPath, "utf8");

        // --- minificar usando terser ---
        log.info(`Minificando: ${file} ...`);
        const minified = await minify(code, {
          module: true,
          compress: true,
          mangle: true,
          output: {
            comments: false,
          },
        });

        if (!minified.code) {
          log.error(`Error al minificar ${file}: sin salida`);
          continue;
        }

        const escaped = JSON.stringify(minified.code);

        const content = `// ⚙️ Archivo autogenerado, no editar manualmente
export const ${constName} = ${escaped};
`;

        // --- escribir archivo TS generado ---
        writeFileSync(outputPath, content);
        log.success(`Generado y minificado: ${outputPath}`);
        processed++;
      } catch (err) {
        log.error(`Error procesando ${file}: ${err.message}`);
      }
    }

    log.info(`🎯 ${processed} worklet(s)/worker(s) procesados correctamente.`);
  } catch (err) {
    log.error(`Error fatal: ${err.message}`);
    process.exit(1);
  }
})();

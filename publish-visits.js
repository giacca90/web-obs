// insert-log.js
const fs = require("fs");
const path = require("path");

const filePath = path.resolve("./dist/web-obs/elements/index.html");

// Lee el archivo
let html = fs.readFileSync(filePath, "utf-8");

// Código que quieres insertar antes de </body>
const scriptToInsert = `
<script>
	// Registro de visitas
	fetch('https://giacca90.ddns.net:5011/log', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			project: 'WebOBS', // Identifica tu proyecto
			url: window.location.href,
			referrer: document.referrer,
		}),
	}).catch((err) => console.error('No se pudo registrar visita:', err));
</script>
</body>`;

// Reemplaza </body> por el bloque nuevo
html = html.replace("</body>", scriptToInsert);

// Escribe el archivo de nuevo
fs.writeFileSync(filePath, html, "utf-8");

console.log("✅ Script de tracking insertado en elements.index.html");

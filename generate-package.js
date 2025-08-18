const fs = require("fs");
const path = require("path");

// Leer el package.json principal
const rootPkg = require("./package.json");

// Crear el nuevo package.json para el webcomponent
const wcPkg = {
  name: "web-obs-wc",
  version: rootPkg.version,
  description: "Web-OBS-wc es un WebComponent que permite crear broadcasts de video y audio directamente ne el navegador.",
  author: rootPkg.author,
  repository: rootPkg.repository,
  keywords: [...(rootPkg.keywords || []), "webcomponent"],
  license: rootPkg.license,
  repository: rootPkg.repository,
  bugs: rootPkg.bugs,
  homepage: rootPkg.homepage,

  main: "main.js",
  module: "main.js",
  types: undefined, // no exportamos typings aquí

  files: ["*"],

  peerDependencies: {
    "zone.js": rootPkg.peerDependencies["zone.js"], // solo lo necesario
  },
};

// Escribir en la carpeta de elementos
const outPath = path.join(__dirname, "./dist/web-obs/elements/package.json");
fs.writeFileSync(outPath, JSON.stringify(wcPkg, null, 2));

console.log("✅ package.json for web-obs-wc generated!");

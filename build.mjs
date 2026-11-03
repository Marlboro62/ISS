// Construction de dist/ :
// - dist/iss-cards.js : les cartes (src/iss-cards.js), sans dépendance ;
// - dist/iss-cards-maps.js : MapLibre GL et sa feuille de style, chargé par les cartes seulement quand
//   une mini-carte vectorielle (sans clé) s'affiche.
// La bibliothèque est reprise telle que publiée sur npm (version fixée dans package.json).
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/iss-cards.js", "dist/iss-cards.js");

await build({
  entryPoints: ["src/maps.js"],
  outfile: "dist/iss-cards-maps.js",
  bundle: true,
  format: "esm",
  target: "es2020",
  // le fichier dist de MapLibre est déjà minifié et crée son worker à partir de son propre code :
  // il ne doit pas être retransformé
  minify: false,
  loader: { ".css": "text" },
  legalComments: "inline",
  banner: { js: "/* Cartes ISS et espace : MapLibre GL JS (BSD-3-Clause). Licence dans les commentaires ci-dessous. */" },
});
console.log("dist/ construit");

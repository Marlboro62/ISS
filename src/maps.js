// Bibliothèque de la mini-carte vectorielle (MapLibre GL et sa feuille de style), livrée avec les cartes
// dans dist/iss-cards-maps.js : aucun script ni style chargé depuis un CDN.
// Ce fichier n'est chargé qu'à l'affichage de la première mini-carte sans clé (import() depuis iss-cards.js).
import * as maplibregl from "maplibre-gl";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 fait ses calculs dans un worker livré à part : dist/iss-cards-maps-worker.js, à côté de ce fichier
maplibregl.setWorkerUrl(new URL("./iss-cards-maps-worker.js", import.meta.url).href);

export { maplibregl, maplibreCss };

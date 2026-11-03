// Bibliothèque de la mini-carte vectorielle (MapLibre GL et sa feuille de style), livrée avec les cartes
// dans dist/iss-cards-maps.js : aucun script ni style chargé depuis un CDN.
// Ce fichier n'est chargé qu'à l'affichage de la première mini-carte sans clé (import() depuis iss-cards.js).
import maplibregl from "maplibre-gl";
import maplibreCss from "maplibre-gl/dist/maplibre-gl.css";

export { maplibregl, maplibreCss };

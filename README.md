<p>
  ☕ <strong>Si cette carte vous est utile, vous pouvez soutenir le projet :</strong>
</p>

<div style="white-space: nowrap; line-height: 0;">
  <a
    href="https://www.buymeacoffee.com/Marlboro62"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://img.buymeacoffee.com/button-api/?text=Offrir%20un%20caf%C3%A9&emoji=%E2%98%95&slug=Marlboro62&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
    alt="Offrir un café sur Buy Me a Coffee"
    height="45"
    style="display: block; border: 0;"
  ></a>&nbsp;&nbsp;<a
    href="https://ko-fi.com/M4M2QL45X"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
    alt="Soutenir le projet sur Ko-fi"
    height="45"
    style="display: block; border: 0;"
  ></a>
</div>

# Cartes ISS et espace

**Cinq cartes Lovelace dans un seul fichier**, aux couleurs des autres cartes ([Météo](https://github.com/Marlboro62/meteo-card), [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new)…) : bleu nuit par défaut, version claire, thème Home Assistant, ou **Glossy HC3 Fibaro** (fond noir, orange, police Orbitron) :

| Type | Carte |
| --- | --- |
| `custom:glossy-space-dashboard-card` | **Space Operations** : les quatre cartes ci-dessous réunies en un seul tableau de bord, avec une seule configuration |
| `custom:glossy-iss-tracker-card` | **ISS Tracker** : position de l'ISS en direct, latitude et longitude, sur une mini-carte sombre |
| `custom:glossy-iss-passes-card` | **Passages ISS** : prochain passage visible et prochain passage global (début, durée, élévation, trajet), graphique de la distance |
| `custom:glossy-iss-transit-card` | **Transits ISS** : prochains passages de l'ISS devant le Soleil et la Lune, avec compte à rebours |
| `custom:glossy-launch-card` | **Prochain lancement** : agence, mission, date (rouge clignotant juste avant le décollage), pas de tir, météo, lanceur, orbite, statut |

Les cartes lisent des **capteurs Home Assistant** : chacune n'affiche que les parties dont le capteur est configuré. Toutes ont un **éditeur visuel**.

Option commune à toutes les cartes, `theme` (« Couleurs de la carte » dans l'éditeur) :

| Valeur | Couleurs |
| --- | --- |
| `v2` (défaut) | Bleu nuit, comme les autres cartes |
| `auto` | Bleu nuit, ou version claire quand Home Assistant est en mode clair |
| `ha` | Couleurs du thème Home Assistant (clair ou sombre) |
| `glossy` | Glossy HC3 Fibaro : fond noir, orange, police Orbitron |

![Space Operations](https://raw.githubusercontent.com/Marlboro62/ISS/main/images/tableau-de-bord.png)

## Installation

### Avec HACS (recommandé)

1. Dans HACS, menu **⋮** → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/ISS` avec le type **Tableau de bord** (Dashboard).
3. Cherchez **Cartes ISS et espace**, installez, puis rechargez la page (Ctrl+F5).

### Manuellement

1. Téléchargez [`iss-cards.js`](https://raw.githubusercontent.com/Marlboro62/ISS/main/iss-cards.js) (clic droit → Enregistrer sous) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter une ressource** : URL `/local/iss-cards.js`, type **Module JavaScript**.
3. Rechargez la page (Ctrl+F5).

> Vous aviez les fichiers séparés (`glossy-iss-tracker-card.js`, `glossy-space-dashboard-card.js`…) ? Les types de carte n'ont pas changé : supprimez simplement les anciennes ressources et gardez celle-ci. Vos tableaux de bord restent tels quels.

## Space Operations — `custom:glossy-space-dashboard-card`

Les quatre cartes en un seul tableau de bord : bandeau de titre, ISS Tracker (avec le statut du signal et le niveau de zoom), passages, prochain lancement et transits. Sur deux colonnes quand la carte est large, sur une seule quand elle est étroite (colonne d'un tableau de bord, téléphone).

```yaml
type: custom:glossy-space-dashboard-card
title: SPACE OPERATIONS
tracker:
  entity: sensor.iss
  carto_api_key: VOTRE_CLE
passes:
  visible_readable_entity: sensor.iss_prochain_passage_visible_lisible
  visible_attrs_entity: sensor.iss_prochain_passage_visible
  global_readable_entity: sensor.iss_prochain_passage_global_lisible
  global_attrs_entity: sensor.iss_prochain_passage_global
  distance_entity: sensor.distance_iss
launch:
  entity: sensor.next_launch_prochain_lancement
  mission_entity: sensor.next_launch_mission_de_lancement
  date_entity: sensor.next_launch_date_de_lancement
  probability_entity: sensor.next_launch_probabilite_de_lancement
  status_entity: sensor.next_launch_statut_de_lancement
transits:
  solar_entity: sensor.iss_next_solar_transit
  lunar_entity: sensor.iss_next_lunar_transit
```

Les sections `tracker`, `passes`, `launch` et `transits` prennent les mêmes options que les cartes séparées, décrites ci-dessous. `title` change le titre du bandeau, `theme` les couleurs de tout le tableau de bord.

## ISS Tracker — `custom:glossy-iss-tracker-card`

```yaml
type: custom:glossy-iss-tracker-card
entity: sensor.iss
carto_api_key: VOTRE_CLE
```

- Position de l'ISS (latitude et longitude) dans le bandeau, **en vert** quand le capteur répond, **en rouge clignotant** quand le signal est perdu.
- **Mini-carte** centrée sur l'ISS, en tuiles sombres [Stadia Maps](https://client.stadiamaps.com/) ou [CARTO](https://carto.com/basemaps/apikey). Il faut **une clé gratuite** de l'un des deux : OpenStreetMap bloque l'affichage de ses tuiles dans une application tierce. Sans clé, la carte l'indique à la place de l'image. La clé reste dans la configuration de votre tableau de bord.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `entity` | Capteur dont les attributs `latitude` et `longitude` donnent la position (par exemple `sensor.iss` de l'intégration officielle **ISS**) | — |
| `status_entity` | Capteur qui décide du vert ou du rouge | `entity` |
| `lat_entity`, `lon_entity` | Capteurs de repli si les attributs de position manquent | — |
| `zoom_span` | Largeur de la vue, en degrés | `40` |
| `stadia_api_key` | Clé Stadia Maps (prioritaire) | — |
| `carto_api_key` | Clé CARTO (si pas de clé Stadia) | — |

## Passages ISS — `custom:glossy-iss-passes-card`

![Passages et transits](https://raw.githubusercontent.com/Marlboro62/ISS/main/images/passages-transits.png)

```yaml
type: custom:glossy-iss-passes-card
visible_readable_entity: sensor.iss_prochain_passage_visible_lisible
visible_attrs_entity: sensor.iss_prochain_passage_visible
global_readable_entity: sensor.iss_prochain_passage_global_lisible
global_attrs_entity: sensor.iss_prochain_passage_global
distance_entity: sensor.distance_iss
```

- **Prochain passage visible** et **prochain passage global** : début, durée, élévation maximale, trajet (direction d'apparition, de culmination et de disparition).
- **Distance** de l'ISS, avec le graphique de son historique.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `title` | Titre | `Passages ISS` |
| `visible_readable_entity` | Capteur dont l'état est la date du passage visible, déjà mise en forme | — |
| `visible_attrs_entity` | Capteur dont les attributs donnent `duration` (en secondes), `maxEl`, `startAzCompass`, `maxAzCompass`, `endAzCompass` | — |
| `global_readable_entity`, `global_attrs_entity` | Les mêmes, pour le passage global | — |
| `distance_entity` | Capteur de distance de l'ISS, en km | — |
| `distance_hours` | Heures d'historique du graphique | `12` |

Une section sans capteur est masquée.

## Transits ISS — `custom:glossy-iss-transit-card`

```yaml
type: custom:glossy-iss-transit-card
solar_entity: sensor.iss_next_solar_transit
lunar_entity: sensor.iss_next_lunar_transit
```

- Date du prochain **transit solaire** et **lunaire**, compte à rebours, durée, élévation, et distance de l'ISS pour la Lune.
- Sans transit prévu, l'approche la plus proche.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `title` | Titre | `Transits ISS` |
| `solar_entity`, `lunar_entity` | Capteurs dont les attributs donnent `date`, `duration_seconds`, `max_elevation_deg`, `iss_distance_km`, `closest_approach_deg` | — |

> Observer un transit solaire demande un **filtre solaire homologué** : ne regardez jamais le Soleil sans protection, ni à l'œil nu ni avec un instrument.

## Prochain lancement — `custom:glossy-launch-card`

![Prochain lancement](https://raw.githubusercontent.com/Marlboro62/ISS/main/images/lancement.png)

```yaml
type: custom:glossy-launch-card
entity: sensor.next_launch_prochain_lancement
mission_entity: sensor.next_launch_mission_de_lancement
date_entity: sensor.next_launch_date_de_lancement
probability_entity: sensor.next_launch_probabilite_de_lancement
status_entity: sensor.next_launch_statut_de_lancement
```

Faite pour l'intégration HACS **Next Launch**.

| Option | Rôle | Défaut |
| --- | --- | --- |
| `entity` | Capteur principal (attributs `provider`, `pad`, `facility`) | — |
| `mission_entity` | Mission (attributs `target_orbit`, `rocket_name`, `description`) | — |
| `date_entity` | Date et heure du lancement | — |
| `probability_entity` | Probabilité météo, en % | — |
| `status_entity` | Statut (vert quand il contient « Go ») | — |
| `imminent_minutes` | Sous ce délai avant le décollage, la carte passe en rouge clignotant | `15` |

## Support

Questions et problèmes : uniquement via les [issues GitHub](https://github.com/Marlboro62/ISS/issues).

## Voir aussi

[Cartes Météo](https://github.com/Marlboro62/meteo-card) · [Cartes Serveur HA](https://github.com/Marlboro62/serveur-ha-card) · [Carte Enedis Linky New](https://github.com/Marlboro62/content-card-linky-new)

## Licence

MIT

## Nom du projet et forks

Ce dépôt est la seule source officielle de **Cartes ISS et espace** (releases, HACS, support),
maintenu par [Marlboro62](https://github.com/Marlboro62).

La licence MIT autorise à copier, modifier et redistribuer le code. Si vous publiez une version modifiée :

- gardez les mentions de copyright du fichier [`LICENSE`](https://github.com/Marlboro62/ISS/blob/main/LICENSE) (© Marlboro62) ;
- **donnez-lui un autre nom** et d'autres types de carte (`custom:glossy-space-dashboard-card`, `custom:glossy-iss-tracker-card`, `custom:glossy-iss-passes-card`,
  `custom:glossy-iss-transit-card` et `custom:glossy-launch-card` sont ceux de ce dépôt) :
  Home Assistant ne peut pas charger deux cartes du même type, et personne ne doit confondre les deux versions dans HACS ;
- ne la présentez pas comme la version officielle et n'orientez pas vers ce dépôt les demandes
  de support qui concernent votre version.

Une correction ou une idée ? Les **pull requests** et les **issues** sont les bienvenues ici :
elles profitent à tous les utilisateurs.

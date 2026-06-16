# DigiFilter – Origo-plugin för Projektkartan

## PLEASE NOTE THAT THIS IS A WORK-IN-PROGRESS VERSION, NOT YET OFFICIALLY RELEASED

DigiFilter är ett plugin till Origo som möjliggör för sökning och filtrering på projektnivå och möjliggör för en så kallad projektkata (resultatet av projektet DigiGrow Fas 2, Tyresö kommun). Pluginet möjliggör för följande funktioner i kartan:

- En **projektväljare** (panel med projekt grupperade på status: pågående, pausade, avslutade), som zoomar kartan till valt projektområde.
- En **träffpanel** som visar träffar på ett antal fördefinerade lager som geografiskt ligger inom det valda projektets utbredning.
- Sök, filtrering och sortering i alla tre flikarna.
- En **rita-sökyta-funktion** där användaren kan rita en egen polygon och få ssamma typ av träffar utan att utgå från ett fördefinierat projekt.
- Integration med en extern 3D/relationshandlings-visare (ViewerPlugin) för att visa/ladda ner bygghandlingar och andra typer av filer.

Detta dokument beskriver vad som måste finnas på plats (lager, attribut, konfiguration) för att pluginet ska fungera korrekt på en ny karta.

---

## 1. Översikt – hur allt hänger ihop

```
index.html
 ├─ window.PROJECTS_CONFIG   → data för projektväljarpanelen (vänster panel)
 └─ DigiFilter({...})         → denna plugin, all konfiguration sker här


index.json
 ├─ lager: projekt_y, arende_y, handling_y, filer_y
 └─ kontroller: sök, legend, etc.

DigiFilter-modulen
 ├─ config.js               → global konfiguration (sätts en gång via initConfig)
 ├─ wfsClient.js            → alla WFS-anrop (GetFeature, Intersects-sökningar)
 ├─ mapControls.js          → zoom, highlight, lagerstyrning
 ├─ ui/projectPanel.js      → projektlistan till vänster
 ├─ ui/featuresPanel.js     → fliken "Ärenden"
 ├─ ui/handlingarPanel.js   → fliken "Handlingar"
 ├─ ui/filerPanel.js        → fliken "Övriga handlingar"
 ├─ ui/drawSearch.js        → "Rita sökyta"
 ├─ ui/modals.js            → detaljvyer/popup-fönster
 └─ editorFix.js            → låser redigeringsverktyg när editorn inte är öppen
```

Allt nedan beskriver vad som krävs i **index.json** (kartans lager) och **index.html** (DigiFilter-konfigurationen) för att kopplingen mellan dem ska fungera.

---

## 2. Krav på lager i index.json

DigiFilter förväntar sig fyra lager/datakällor. Namnen på dessa anges i DigiFilter-konfigurationen (se avsnitt 3) och måste motsvara riktiga lager i `index.json`.

### 2.1 Projektlager (`layerName` / `wfsTypename`)

- **Exempel:** `projekt_y`
- **Typ:** WFS, `queryable: true`, bör vara synligt (`visible: true`) eftersom det är huvudlagret på kartan.
- **Krav:**
  - Måste ha en geometri (polygon/multipolygon) som täcker projektområdet.
  - Måste ha ett attribut som identifierar projektet, vanligen `projekt_nr`. Detta attribut används för att:
    - Hämta projektets utbredning (extent) när användaren klickar på ett projekt i listan.
    - Beräkna den WKT-polygon som sedan används för att söka i övriga lager.
  - `style` styr hur projektytorna ritas (t.ex. `projekt_style` i exemplet, med olika färger per `typ`).
  - Klick på en projektyta i kartan ska trigga samma zoom/sökflöde som klick i projektlistan – detta sker automatiskt via DigiFilter, men kräver att lagrets `name` matchar `layerName` i konfigurationen.

### 2.2 Ärendelager (`arendeLayer`)

- **Exempel:** `arende_y`
- **Typ:** WFS, `queryable: true`, ska ingå i `queryableLayers` (se nedan), bör vara `visible: false` som standard (DigiFilter visar/döljer det själv).
- **Krav – attribut som måste finnas och pekas ut i `arendeAttributes`:**

  | Nyckel i `arendeAttributes` | Beskrivning | Exempel på fältnamn |
  |---|---|---|
  | `id`           | Unikt id för ärendet, används för koppling till handlingar och highlight | `arende_id` |
  | `title`        | Ärendets rubrik, visas i listan och i detaljvyn | `rubrik` |
  | `type`         | Ärendetyp – används för filterdropdownen "Filtrera efter ärendetyp" | `arendetyp` |
  | `property`     | Fastighetsbeteckning – visas i listan och kan sökas på | `fastighet` |
  | `diarieNumber` | Diarienummer – visas, kan sökas på och sorteras på | `diarie_nummer` |
  | `created`      | Skapad-/registreringsdatum – används för datumsortering | `skapad` |

  - Geometrin används för att avgöra vilka ärenden som ligger inom projektytan (eller den ritade sökytan).
  - För att highlight ska fungera (klick på ärende → markering i kartan) måste `id` motsvara feature-id eller ett attribut som går att matcha mot kartans features.

### 2.3 Handlingslager (`handlingLayer`)

- **Exempel:** `handling_y`
- **Typ:** WFS, normalt en tabell (`isTable: true`, ingen geometri behövs) – kopplas till ärendelagret via FK/PK.
- **Krav – attribut i `handlingAttributes`:**

  | Nyckel | Beskrivning | Exempel |
  |---|---|---|
  | `id`         | Unikt id för handlingen | `handling_id` |
  | `label`      | "Beteckning" – visas och används i filterdropdownen "Filtrera efter beteckning" | `beteckning` |
  | `description`| Beskrivande text, visas i listan och används vid fritextsökning | `beskrivning` |
  | `registered` | Registreringsdatum – används av datumfiltret "Registrerad från/till" | `registrerat` |
  | `arendeId`   | Främmande nyckel mot ärendet (`arendeAttributes.id`) | `arende_id` |

  - DigiFilter hämtar alla handlingar vars `arendeId` matchar ärenden inom projektområdet (batchat i grupper om 20).
  - Varje handling visas tillsammans med ärendets rubrik, diarienummer, fastighet och skapad-datum (hämtas automatiskt från det tillhörande ärendet).
  - Vid klick på en handling öppnas den i en iframe via `lexHandlingBase` + handlingens `id` (se avsnitt 3).

### 2.4 Fillager / relationshandlingar (`filerLayer`)

- **Exempel:** `filer`
- **Typ:** WFS, `queryable: true`.
- **Krav:**
  - Måste ha en geometrikolumn som heter **`projektomrade`** (hårdkodat i `wfsClient.js`, `fetchFilerForProjekt` och draw-search). Denna geometri används för intersects-sökningen mot projektets/sökytans polygon.
  - Attribut i `filerAttributes`:

    | Nyckel | Beskrivning | Exempel |
    |---|---|---|
    | `filnamn`      | Filens namn – visas i listan, sökbart | `filnamn` |
    | `fil_sokvag`   | Sökväg/länk till filen – visas som klickbar länk i detaljvyn | `fil_sokvag` |
    | `filtyp`       | Filtyp | `filtyp` |
    | `skapad_datum` | Skapad-datum – visas, formateras (YYYY-MM-DD) | `skapad_datum` |
    | `andrad_datum` | Ändrad-datum – visas i detaljvyn | `andrad_datum` |
    | `disciplin`    | Disciplin – sökbart | `disciplin` |
    | `skede`        | Skede – används för filterdropdownen "Filtrera efter skede" och är sökbart | `skede` |
    | `upprattat_av` | Upprättat av – visas i detaljvyn | `upprattat_av` |
    | `projektetapp` | Projektetapp – visas och är sökbart | `projektetapp` |
    | `projektid`    | Koppling till projektets id (för 3D-visaren, se avsnitt 2.6) | `projekt_id` |

### 2.6 Projekttabell för 3D-visaren (`projekt` i WFS-workspace)

- Utöver `projekt_y` förväntar `filerPanel.js` att det finns en separat WFS-tabell/lager kallad **`projekt`** i samma workspace (`wfsWorkspace`), med minst attributen:
  - `id` (matchas mot `filerAttributes.projektid`, dvs `filer`-lagrets `projekt_id`)
  - `projektnummer` (det "riktiga" projektnumret som skickas vidare till 3D-visaren/ViewerPlugin)
  - Detta används enbart när `window.viewerPlugin` finns och en fil i "Övriga handlingar" har ett `projektid`. Om tabellen saknas eller sökningen misslyckas döljer pluginet bara 3D-knapparna – ingen krasch.

### 2.7 `queryableLayers`

- Lista över vilka lager (utöver projektlagret) som ska sökas igenom när ett projekt väljs eller en sökyta ritas.
- I dagens konfiguration: `['arende_y']`.
- **Obs:** Filer (`filerLayer`) hanteras separat (alltid via `projektomrade`-geometrin) och behöver inte ingå här.
- Lager i denna lista måste vara av `type: "WFS"` och ha en geometrikolumn som heter `geom` (hårdkodat i intersects-frågan i `wfsClient.js`).

---

## 3. Konfiguration i index.html

# Det finns en exempel index.html i detta repo som kan nyttjas, se nedan för mer information.

All konfiguration sker i `DigiFilter({...})`-anropet i `index.html`. Nedan är en genomgång av varje nyckel.

```js
const digiFilter = DigiFilter({
  wfsBase:          'https://kommunkarta.tyreso.se/geoserver/wfs',
  wfsSrs:           'EPSG:3011',
  wfsTypename:      'projekt_y',
  layerName:        'projekt_y',
  wfsWorkspace:     'projektkarta',
  arendeLayer:      'arende_y',
  handlingLayer:    'handling_y',
  filerLayer:       'filer_y',
  lexHandlingBase:  'https://kommunkarta.tyreso.se/lex_handling/view/',
  queryableLayers:  ['arende_y'],
  arendeAttributes: { ... },
  handlingAttributes: { ... },
  projektAttributes: { ... },
  filerAttributes: { ... }
});
```

| Inställning | Beskrivning |
|---|---|
| `wfsBase` | Bas-URL till GeoServers WFS-endpoint. Används för alla `GetFeature`-anrop. |
| `wfsSrs` | Koordinatsystem som WFS-anropen ska be om/skicka koordinater i (t.ex. `EPSG:3011`). Måste matcha `projectionCode` i `index.json`. |
| `wfsTypename` | Lagernamnet (utan workspace-prefix) för **projektlagret**, t.ex. `projekt_y`. Används vid hämtning av projektets geometri (`fetchExtentByProjektNr`, `getProjektWKT`). |
| `layerName` | Namnet på projektlagret **som det heter i `index.json`** (`layers[].name`). Används av kartklick, editor-fix och highlight. Normalt samma värde som `wfsTypename`. |
| `wfsWorkspace` | GeoServer-workspace som `arendeLayer`, `handlingLayer` och `filerLayer` ligger i. Sätts ihop med lagernamn till `workspace:lager` i WFS-anrop. |
| `arendeLayer` | Lagernamn (utan workspace) för ärenden, t.ex. `arende_y`. Måste även vara `layers[].name` i `index.json` och `queryable: true`. |
| `handlingLayer` | Lagernamn (utan workspace) för handlingar, t.ex. `handling_y`. |
| `filerLayer` | Lagernamn (utan workspace) för relationshandlingar/övriga filer, t.ex. `filer`. Standard är `'filer'` om inget anges. |
| `lexHandlingBase` | URL-prefix som en handlings `id` läggs på för att visa handlingen i en iframe (modal), t.ex. `https://.../lex_handling/view/`. Här behövs en tjänst som förmedlar information till denna URL, t.ex. en Pythonapplikation eller annan typ av API |
| `queryableLayers` | Array med lagernamn (utan workspace) som ska sökas igenom inom projektytan/sökytan, t.ex. `['arende_y']`. |
| `arendeAttributes` | Se tabell i avsnitt 2.2. |
| `handlingAttributes` | Se tabell i avsnitt 2.3. |
| `projektAttributes.projektNr` | Namnet på det attribut i **projektlagret** som identifierar projektet (motsvarar `id` i `window.PROJECTS_CONFIG`), t.ex. `projekt_nr`. |
| `filerAttributes` | Se tabell i avsnitt 2.4. |

---

## 4. Projektlistan – `window.PROJECTS_CONFIG`

Projektväljaren (vänster panel) renderas helt utifrån en global JS-array som definieras direkt i `index.html`:

```js
window.PROJECTS_CONFIG = [
  {
    id: 1,
    name: "Bollmoravägen",
    status: "pausade",
    image: "/origo/build/data/projekt/1.jpg",
    projectmanager: "Leif Ledarsson"
  },
  {
    id: 2,
    name: "Norra Tyresö Centrum",
    status: "pagande",
    image: "/origo/build/data/projekt/2.png",
    projectmanager: "Leif Ledarsson",
    subprojects: [
      { id: 15, name: "Etapp 1, Småa" },
      ...
    ]
  },
  ...
];
```

| Fält | Obligatoriskt | Beskrivning |
|---|---|---|
| `id` | Ja | Måste motsvara värdet i `projektAttributes.projektNr` (t.ex. `projekt_nr`) i WFS-lagret `projekt_y`/`wfsTypename`. Detta är nyckeln som binder ihop projektkortet med kartans geometri. |
| `name` | Ja | Visningsnamn i listan. |
| `status` | Ja | Måste vara ett av: `pagande`, `pausade`, `avslutade`. Styr vilken flik (tab) projektet visas under. |
| `image` | Ja | Sökväg till bild som visas som thumbnail på projektkortet. |
| `projectmanager` | Ja | Visas i projektkortet ("Projektledare: ..."). |
| `subprojects` | Nej | Array av `{ id, name }`. Om angiven visas en expanderbar lista med delprojekt. **Varje delprojekts `id` måste också motsvara ett `projekt_nr`-värde** i `projekt_y`, eftersom klick på ett delprojekt anropar samma zoom/sökflöde som ett huvudprojekt. |

**Viktigt:** Om ett `id`/`projekt_nr` i `PROJECTS_CONFIG` inte finns som feature i `projekt_y`-lagret kommer `fetchExtentByProjektNr` att returnera `null`, och inget händer (felet loggas i webbläsarens konsol).

---

## 5. Övriga komponenter i index.html

### 5.1 ViewerPlugin (3D/relationshandlingar)

```js
var viewerPlugin = ViewerPlugin({
  apiBaseUrl: "https://fme01.tyreso.se",
  viewerEndpoint: "/api/relationshandlingar/fetch",
  downloadEndpoint: "/api/relationshandlingar/fetch",
  ...
});
viewer.addComponent(viewerPlugin);
window.viewerPlugin = viewerPlugin;
```

- Måste sättas på `window.viewerPlugin` – `filerPanel.js` letar efter detta globalt för att visa knapparna "Visa 3D", "Öppna i ny flik" och "Ladda ner" i filens detaljvy.
- Kräver att `filerAttributes.projektid` finns på fil-featuren och att den kan slås upp till ett `projektnummer` via WFS-tabellen `projekt` (se avsnitt 2.6).


### 5.3 HTML-element som DigiFilter förväntar sig

DigiFilter binder sig till specifika element-ID:n i `index.html`. Om dessa byts ut eller tas bort slutar motsvarande funktion att fungera:

- `#project-list`, `#project-selector`, `#header-toggle-btn`, `#close-selector` – projektlistan
- `#features-panel`, `#features-content`, `#close-features`, `.features-header`, `#features-filter`, `#filter-dropdown-btn`, `#filter-dropdown-menu`, `#filter-btn-text` – ärendefliken
- `#arenden-search-input`, `#arenden-sort-select` – sök/sortering för ärenden
- `#handlingar-search-input`, `#handlingar-list`, `#handlingar-date-from`, `#handlingar-date-to`, `#handlingar-filter-dropdown-btn`, `#handlingar-filter-dropdown-menu`, `#handlingar-filter-btn-text` – handlingsfliken
- `#filer-search-input`, `#filer-list`, `#filer-sked-dropdown-btn`, `#filer-sked-dropdown-menu`, `#filer-sked-btn-text` – filer-fliken
- `#draw-search-btn` – knapp för "Rita sökyta"
- `.features-tab` / `.tab-content` med `data-tab="arenden"|"handlingar"|"filer"` och motsvarande `#tab-arenden`, `#tab-handlingar`, `#tab-filer` – flikväxling

---

## 6. Checklista vid uppsättning av en ny projektkarta

1. **Lägg till projektlagret** (`projekt_y` eller motsvarande) i `index.json`:
   - Polygon-/multipolygon-geometri.
   - Attribut för projektnummer (t.ex. `projekt_nr`), namn, typ, status, m.m.
   - Sätt `style` så att `typ`-värdena matchar de filter som finns i `projekt_style`, eller uppdatera stilen.

2. **Lägg till ärendelagret** (`arende_y` eller motsvarande):
   - Geometri (för intersects mot projektytan).
   - Attribut motsvarande `arendeAttributes` (id, rubrik, typ, fastighet, diarienummer, skapad-datum).
   - `queryable: true`, ingå i `queryableLayers`.

3. **Lägg till handlingstabellen** (`handling_y` eller motsvarande):
   - Attribut motsvarande `handlingAttributes`, inklusive FK mot ärendet.

4. **Lägg till fillagret** (`filer_y` eller motsvarande):
   - Geometrikolumn `geom`.
   - Attribut motsvarande `filerAttributes`.
   - Om 3D-visning ska användas: lägg till/koppla tabellen `projekt` med `id` och `projektnummer`.

6. **Fyll i `DigiFilter({...})`** i `index.html` med rätt `wfsBase`, `wfsSrs`, `wfsWorkspace` och alla lager-/attributnamn enligt avsnitt 3.

7. **Fyll i `window.PROJECTS_CONFIG` i `index.html`**:
   - Ett objekt per projekt/delprojekt som ska gå att välja.
   - Säkerställ att varje `id` matchar ett `projekt_nr`-värde i projektlagret.
   - Sätt korrekt `status` (`pagande`/`pausade`/`avslutade`) så projektet hamnar under rätt flik.

9. **Testa flödet:**
   - Klicka på ett projekt i listan → kartan zoomar till projektets utbredning.
   - Fliken "Ärenden" fylls med ärenden inom ytan, filter och sortering fungerar.
   - Fliken "Handlingar" fylls med handlingar kopplade till dessa ärenden, sök/datumfilter fungerar.
   - Fliken "Övriga handlingar" fylls med filer vars `projektomrade` korsar projektytan.
   - "Rita sökyta" ger motsvarande resultat för en valfri polygon.
   - Klick på ett ärende öppnar detaljvy med kopplade handlingar (om `relatedLayers` är konfigurerat i `index.json`).

---

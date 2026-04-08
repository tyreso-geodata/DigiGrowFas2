# Origo AreaSelect Plugin

Ett plugin till **Origo** som låter användaren rita ett område (Rektangel, Polygon eller Punkt) på kartan och skicka geometrin direkt till ett **FME Flow** workspace som en **WGS84 GeoJSON**.

## Funktioner

- **Rita:** Välj mellan rektangel, polygon eller punkt.
- **Transformera:** Omvandlar automatiskt från kartans projektion (t.ex. SWEREF 99 TM) till **WGS84 (EPSG:4326)**.
- **FME-integration:** Bygger en URL med parametern `dynamicParameterData` som FME Flow kan läsa in direkt.

---

## Så här fungerar det

1. Klicka på uppladdningsknappen i kartans verktygsrad
2. Välj ritverktyg (rektangel, polygon eller punkt)
3. Rita ett område på kartan
4. En förhandsvisning av geometrin visas i en modal
5. Klicka "Skicka data" för att öppna FME Flow med geometrin, eller "Rita om" för att rita på nytt

---

## Utveckling

Installera och bygg pluginet:

```bash
npm install
npm run build
```

Bygget skapar följande filer:
- `build/js/areaselect.min.js`
- `build/css/areaselect.css`

---

## Installation

Kopiera de kompilerade filerna till din Origo-installation:

```
plugins/
  areaselect/
    js/areaselect.min.js
    css/areaselect.css
```

---

## Konfiguration

Lägg till följande i din `index.html`:

```html
<script src="plugins/areaselect/js/areaselect.min.js"></script>
<link rel="stylesheet" href="plugins/areaselect/css/areaselect.css" />

<script type="text/javascript">
  var origo = Origo("index.json");

  origo.on("load", function (viewer) {

    var areaSelect = areaselect({
      fmeBaseUrl: "https://fme.se/fmeserver/mitt-workspace", // Obligatorisk
      buttonIcon: "#ic_upload_file_24px", // Valfri
      tooltipText: "Ladda upp data", // Valfri
    });
    viewer.addComponent(areaSelect);
  });
</script>
```

### Options

| Parameter     | Typ    | Standard               | Beskrivning                                                                                  |
| :------------ | :----- | :--------------------- | :------------------------------------------------------------------------------------------- |
| `fmeBaseUrl`  | String | `""`                   | **Obligatorisk.** URL till ditt FME Flow workspace.      |
| `buttonIcon`  | String | `"#ic_upload_file_24px"` | Valfri. SVG-symbol-id för huvudknappens ikon.                                              |
| `tooltipText` | String | `"Ladda upp data"`     | Valfri. Tooltip-text som visas när användaren hovrar över huvudknappen.                      |
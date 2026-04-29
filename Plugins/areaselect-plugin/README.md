# Origo AreaSelect Plugin

Ett plugin till **Origo** som låter användaren rita ett område (Rektangel eller Polygon) på kartan och skicka geometrin till **FME Flow** som en **WGS84 GeoJSON**.

## Funktioner

- **Rita:** Välj mellan rektangel eller polygon.
- **Transformera:** Omvandlar automatiskt från kartans projektion (t.ex. SWEREF 99 TM) till **WGS84 (EPSG:4326)**.
- **FME-integration:** Bygger en URL med parametern `dynamicParameterData` som FME Flow kan läsa in direkt.
- **Konfigurerbara destinationer:** Valfritt antal knappar i modalen, var och en med eget namn och URL till ett FME Flow workspace.

## Så här fungerar det

1. Klicka på uppladdningsknappen i kartans verktygsrad
2. Välj ritverktyg (rektangel eller polygon)
3. Rita ett område på kartan
4. En förhandsvisning av geometrin visas i en modal
5. Välj destination för att öppna FME Flow med geometrin, eller "Rita om" för att rita på nytt, eller "Avbryt" för att avsluta

## Utveckling

Installera och bygg pluginet:

```bash
npm install
npm run build
```

Bygget skapar följande filer:
- `build/js/areaselect.min.js`
- `build/css/areaselect.css`

## Installation

Kopiera de kompilerade filerna till din Origo-installation:

```
plugins/
  areaselect/
    js/areaselect.min.js
    css/areaselect.css
```

## Konfiguration

Lägg till följande i din `index.html`:

```html
<script src="plugins/areaselect/js/areaselect.min.js"></script>
<link rel="stylesheet" href="plugins/areaselect/css/areaselect.css" />

<script type="text/javascript">
  var origo = Origo("index.json");

  origo.on("load", function (viewer) {

    var areaSelect = areaselect({
      destinations: [
        { label: "Relationshandlingar", url: "https://fme.se/fmeserver/relationshandlingar" },
        { label: "Övriga ritunderlag",  url: "https://fme.se/fmeserver/ovriga-ritunderlag" },
        { label: "Rita projektyta",     url: "https://fme.se/fmeserver/projektyta" },
      ],
      geometryParamName: "GEOMETRY", // Valfri
      buttonIcon: "#ic_upload_file_24px", // Valfri
      tooltipText: "Ladda upp data", // Valfri
    });
    viewer.addComponent(areaSelect);
  });
</script>
```

### Options

| Parameter | Standard | Beskrivning |
| :--- | :--- | :--- |
| `destinations` | Se nedan | **Obligatorisk.** Array av objekt med `label` och `url`. Varje objekt blir en knapp i modalen. |
| `geometryParamName` | `"GEOMETRY"` | Valfri. Styr vilket namn geometrin får som `name` i `dynamicParameterData`. |
| `buttonIcon` | `"#ic_upload_file_24px"` | Valfri. SVG-symbol-id för huvudknappens ikon. |
| `tooltipText` | `"Ladda upp data"` | Valfri. Tooltip-text som visas när användaren hovrar över huvudknappen. |

### destinations

Varje objekt i `destinations`-arrayen har följande egenskaper:

| Egenskap | Beskrivning |
| :--- | :--- |
| `label` | Text som visas på knappen i modalen. |
| `url` | URL till ett FME Flow workspace. Geometrin bifogas automatiskt som `dynamicParameterData` i query-strängen. |
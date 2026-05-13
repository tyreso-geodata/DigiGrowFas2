# RUNBOOK: Kartklient och lager

> **Index:** [00-översikt.md](./00-översikt.md)

## FAS 6: Koppla Origo Admin till Origo-kartklienten

### Förutsättning

Origo-kartklienten måste redan vara installerad och tillgänglig via IIS på `https://<PUBLIK-URL>`.

### Arkitekturöversikt

```
Användare (webbläsare)
    │
    ▼
IIS (<PUBLIK-URL>)
    ├── /              > Origo-kartklient (statiska filer på IIS)
    ├── /admin         > Origo Admin klient (VM port 3000)
    ├── /proxy         > Origo Admin Proxy (VM port 3020)
    ├── /api           > Origo Admin Server (VM port 3010)
    └── /application/o > Redirect till Authentik (VM port 3050)
```

---

> **Förutsättning innan du börjar:** Fas 6.1 i [02-källkodsfixar.md](02-källkodsfixar.md) måste vara gjord. Den öppnar proxyn för oinloggade användare så att Origo-kartklienten kan hämta kartinstanser utan inloggning.

## FAS 6.2: Skapa en kartinstans i Origo Admin

Skapa och publicera en kartinstans i Origo Admin. Notera kartinstansens **ID** från URL:en på publicera-sidan, t.ex. `64a1f3c2e4b09d1234567890`.

Verifiera att proxyn når kartinstansen utan inloggning:

- **HTTPS:** `https://<PUBLIK-URL>/proxy/mapinstances/published/{kartid}`

Du ska få ett JSON-svar utan att vara inloggad.

## FAS 6.3: Uppdatera Origo-kartklienten på IIS

Hitta kartklientens `index.html` via IIS Manager > siten > **Explore**.

```html
<!-- Gammal: -->
<!-- var origo = Origo('index.json'); -->

<!-- Ny: -->
<script type="text/javascript">
  var origo = Origo('/proxy/mapinstances/published/<KARTINSTANS-ID>', {
      baseUrl: '/origo/build/'
  });
</script>
```

> **Viktigt:** Använd relativ sökväg (`/proxy/...`), inte absolut URL (`https://...`). Origo tolkar annars URL:en som en bas-sökväg och lägger på `/undefined.json` på slutet.

## FAS 6.4: Verifiera kopplingen

1. `https://<PUBLIK-URL>/proxy/mapinstances/published/{kartid}` > JSON-konfiguration utan inloggning.
2. `https://<PUBLIK-URL>` > Kartan laddar med konfiguration från Origo Admin.
3. Förhandsgranskning i Origo Admin fungerar.
4. `https://<PUBLIK-URL>/admin` > Inloggning och admin-funktioner fungerar.

## FAS 6.5: Felsökning koppling

| Problem | Kontroll |
|---|---|
| `/proxy/mapinstances` ger 502 | IIS-regel för `/proxy`: rätt IP och port 3020? |
| `/proxy/mapinstances` ger tom lista | Kartinstansen publicerad? |
| Kartan laddar inte | Kartinstans-ID i HTML stämmer? Relativ sökväg används? |
| CORS-fel | `AUTH_CLIENT_DOMAIN` i proxy matchar `<PUBLIK-URL>`? `REDIRECT_URI` satt? |
| Gammal konfiguration visas | Rensa cache: `origo-authentik exec proxy wget -qO- http://localhost:3020/proxy/refresh-cache` |
| Inloggning ger 404 på `/application/o/authorize/` | Saknas IIS-regeln "Authentik Authorize"? Se Fas 5.3, Regel 1. |
| `User not authorized` trots korrekt inloggning | Buggfixarna i [02-källkodsfixar.md](02-källkodsfixar.md) gjorda? Inloggning sker med **användarnamnet** `akadmin` (inte e-post)? `PROTECTED_IDP_SCOPE` innehåller `groups`? |
| Kartan ger "Unauthorized" på `/proxy/mapinstances/published/` | Ändringarna i Fas 6.1 inte gjorda eller skrivna över av `git pull`. |

## FAS 6.6: Lägga till lager (WMS, WFS, WMTS)

Lager läggs till i två steg: först registreras datakällan (tjänstens URL), sedan importeras lager från den källan via en guide.

### Förutsättning: Skapa ett dummy-stilschema

Origo Admin kräver att ett stilschema väljs för varje lager - även för WMS-lager där Geoserver hanterar stilen själv. Stilschemat måste ha ett giltigt innehåll - en tom array eller ett tomt objekt fungerar inte eftersom Origo-klienten kraschar vid laddning.

Skapa ett stilschema med namnet `wms-dummy` och följande innehåll:

```json
{"stroke":{"color":"rgba(0,0,0,1.0)","width":1},"fill":{"color":"rgba(0,0,0,0)"}}
```

> **Obs:** WMS-lager renderas av Geoserver med sin egen SLD-stil. Stilschemat i Origo Admin används för att Origo-klienten ska kunna initialisera lagret - det påverkar inte hur WMS-lagret faktiskt visas på kartan.
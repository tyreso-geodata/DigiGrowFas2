# Översikt - Origo Admin

Denna guide visar hur du sätter upp en säker lösning där en Windows-server (IIS) fungerar som skydd framför en Linux-server med Docker. VM:en körs i vCenter och Tyresö IT ansvarar för VM-backup på hypervisornivå.

**Runbooken är identisk för test- och produktionsmiljön.** Skillnaden mellan miljöerna ligger enbart i `.env` och `docker-compose.override.local.yaml`. Båda miljöerna använder Authentik som IdP.

## Vilket dokument behöver jag?

| Vad vill du göra?                                                                                                                    | Dokument                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Ny installation (VM → IIS uppe)                                                                                                      | [01-förutsättningar-och-installation.md](01-förutsättningar-och-installation.md) |
| Obligatoriska källkodsfixar, buggfixar + proxy för publika kartor. Måste göras vid nyinstallation och kontrolleras efter `git pull`. | [02-källkodsfixar.md](02-källkodsfixar.md)                                       |
| Koppla Origo-kartklienten, lägga till lager                                                                                          | [03-kartklient-och-lager.md](03-kartklient-och-lager.md)                         |
| Backup, återställning, uppgradera repot                                                                                              | [04-backup-och-uppgradering.md](04-backup-och-uppgradering.md)                   |
| Något har gått sönder - snabbåterställning eller VM-krasch                                                                           | [05-felsökning-och-återställning.md](05-felsökning-och-återställning.md)         |

## Arkitekturprinciper

- **IIS är enda publika ingress för Origo Admin.** Användare når portarna 3000, 3010 och 3020 enbart via IIS.
- **Port 3050 (Authentik) nås direkt av webbläsaren** - inte via IIS. Inloggning och utloggning i Origo Admin skickar webbläsaren direkt till VM:ens IP på port 3050. Detta gäller alla användare, inte bara administratörer.
- **IIS hanterar även redirect till Authentik** - IIS behöver en redirect-regel som fångar `/application/o/` och skickar webbläsaren vidare till Authentik på VM:en.
- **Test och prod följer exakt samma runbook.** Skillnaden ligger i `.env` och lokal override.
- **Repo-filer ändras aldrig för driftanpassningar.** All miljöspecifik konfiguration sker i `.env` och `docker-compose.override.local.yaml`. Undantaget är källkodsfixarna i [02-källkodsfixar.md](02-källkodsfixar.md) som måste göras manuellt.

### Nätverksöversikt

```
Användare (webbläsare)
    │
    ├── https://<PUBLIK-URL>/admin            ──► IIS (port 443) ──► VM port 3000 (client)
    ├── https://<PUBLIK-URL>/proxy            ──► IIS (port 443) ──► VM port 3020 (proxy)
    ├── https://<PUBLIK-URL>/api              ──► IIS (port 443) ──► VM port 3010 (server)
    ├── https://<PUBLIK-URL>/application/o/   ──► IIS redirect (302) ──► VM port 3050 (Authentik)
    │
    └── http://<VM-IP>:3050                     ──► VM port 3050 (Authentik) DIREKT, ej via IIS
         (sign-out och direkt åtkomst)
```

> **Obs:** IIS kommunicerar med VM:en internt via HTTP. SSL termineras på IIS.

Portar som måste vara öppna:

|Från|Till|Port|Syfte|
|---|---|---|---|
|Alla användares webbläsare|IIS (Windows-server)|443|Origo Admin|
|Alla användares webbläsare|VM|3050|Inloggning och utloggning via Authentik|
|IIS (Windows-server)|VM|3000, 3010, 3020|Reverse proxy|
|Admin-dator|VM|22|SSH|

> **Viktigt:** Port 3050 måste vara nåbar för alla användare som ska logga in i Origo Admin - inte bara administratörer.

### Driftlägen

Systemet startas med:

```bash
origo-authentik up -d
```

Använder alla tre compose-filer. Startar Authentik som IdP.

> **Obs:** `origo-authentik` är ett shell-alias som definieras i Fas 2.3 för att undvika långa kommandorader med `-f`-flaggor.

### Miljöskillnader

Följande värden är de enda som skiljer sig mellan test och prod:

|Parameter|Test|Prod|
|---|---|---|
|VM-namn i vCenter|`origo-admin-test`|`origo-admin-prod`|
|`BACKUP_NAME` i backup-skript|`origo-backup-test`|`origo-backup-prod`|
|URL:er i `.env` och lokal override|Test-URL:er|Prod-URL:er|

## Identitetsprovider och AD/Entra ID

Systemet är konfigurerat med Authentik som identitetsprovider (IdP). Authentik hanterar inloggning och behörigheter för Origo Admin.

Om ni i framtiden vill byta till AD/Entra ID via er Microsoft-miljö - kontakta oss så hjälper vi er med det bytet.

## Kända buggar i repot

Följande buggar finns i repot och kräver manuella åtgärder. Alla källkodsändringar finns i [02-källkodsfixar.md](02-källkodsfixar.md) och måste återupprepas efter `git pull` om de skrivs över.

**1. `userInforService.ts` - groups-array behandlas som sträng**
Filen `client/src/lib/auth/userInforService.ts` anropar `.split(",")` på `data.groups` som är en JSON-array från IdP:t. Detta orsakar `User not authorized` för alla användare oavsett roll.
Fix: Se Fix 1 i [02-källkodsfixar.md](02-källkodsfixar.md).

**2. `GenericJsonFormView.tsx` - JSONEditor skriver över DB-värde vid mount**
JSONEditor anropar `onChange` direkt när den mountas och skriver över det värde som hämtats från databasen med `initialJsonContent` (`{ Example: 'Example' }`). Resultatet är att redigera-sidan alltid visar standardvärdet istället för det sparade värdet.
Fix: Se Fix 2 i [02-källkodsfixar.md](02-källkodsfixar.md).

**3. `Logo.tsx` - logotypens sökväg är inte basePath-aware**
Filen `client/src/components/Drawer/Logo/Logo.tsx` använder `LOGO`-värdet direkt utan att prefixera med base path. När appen körs under `/admin` ger detta 400-fel för logotypen.
Fix: Se Fix 3 i [02-källkodsfixar.md](02-källkodsfixar.md).

**4. `dataService.ts` - WFS stöder inte Geoserver**
Filen `client/src/services/dataService.ts` hanterar inte namespace-prefix i WFS GetCapabilities (`wfs:WFS_Capabilities`) eller DescribeFeatureType (`xsd:schema`, `xsd:complexType`). Koden var skriven för QGIS Server. Mot Geoserver ger detta `Error fetching capabilities: Cannot read properties of undefined (reading 'FeatureTypeList')` och `Error fetching data: Cannot read properties of undefined (reading 'forEach')`.
Fix: Se Fix 4 i [02-källkodsfixar.md](02-källkodsfixar.md).

**5. `typescript` och typdeklarationer i devDependencies (server och proxy)**
Både server (`typescript`) och proxy (`@types/cookie-parser`) har byggberoenden i `devDependencies` istället för `dependencies`. När Docker bygger med `NODE_ENV=production` (standardvärdet) installeras inte devDependencies, vilket gör att TypeScript-bygget misslyckas för båda. Server ger `This is not the tsc command you are looking for` och proxy ger `Could not find a declaration file for module 'cookie-parser'`.
Fix: Sätt `NODE_ENV: development` under `build.args` för både `server` och `proxy` i override-filen. Observera att detta är `build.args.NODE_ENV` (gäller enbart under Docker-bygget) - inte `environment.NODE_ENV` (som gäller vid runtime). Se steg 3.4 i [01-förutsättningar-och-installation.md](01-förutsättningar-och-installation.md).

**6. `NEXT_PUBLIC_PROXY_URL` och `NEXT_PUBLIC_BASE_PATH` som Docker-miljövariabler**
`NEXT_PUBLIC_`-variabler bäddas in vid byggtid och läses inte från Docker-miljövariabler vid runtime. Klientens Dockerfile saknar dessa som ARG, vilket gör att de aldrig bäddas in om de bara sätts i override-filen.
Fix: Sätt dem i `client/.env.production` innan bygget. Se steg 3.5 i [01-förutsättningar-och-installation.md](01-förutsättningar-och-installation.md).

## Verifiering

|Test|Metod|Förväntat|
|---|---|---|
|Publikt (HTTPS)|`https://<PUBLIK-URL>/admin`|Admin-gränssnittet visas via IIS|
|Inloggning|Logga in med användarnamnet `akadmin` (inte e-post)|Admin-behörighet i Origo Admin|
|Loggar|`origo-authentik logs -f server`|Realtidsloggar|
|Backup|`/opt/backups/mongodb/backup.sh`|Backup sparas lokalt i VM|

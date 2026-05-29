# Källkodsfixar

> **Index:** [00-översikt.md](./00-översikt.md)


Dessa ändringar görs manuellt i källkoden och måste **återupprepas efter `git pull`** om de skrivs över. Kontrollera alltid att de finns kvar efter en uppdatering.

**Ordning vid nyinstallation:**
1. Gör **buggfixarna nedan** innan du bygger Docker-images (steg 3.6 i `01-förutsättningar-och-installation.md`), gå sedan tillbaka dit och fortsätt.
2. Gör **Fas 6.1** efter att hela systemet är uppe och IIS-proxyn är konfigurerad - dvs. som första steg i `03-kartklient-och-lager.md`.

## Buggfixar i källkoden

Repot har fyra buggar som måste åtgärdas i källkoden innan bygget.

#### Fix 1: groups-array i userInforService.ts

Filen `client/src/lib/auth/userInforService.ts` anropar `.split(",")` på `data.groups` som är en JSON-array från IdP:t. Detta kraschar och ger `User not authorized` för alla användare.

```bash
micro ~/origo-admin/client/src/lib/auth/userInforService.ts
```

Hitta raden:
```typescript
claims: data.groups,
```

Ändra till:
```typescript
claims: Array.isArray(data.groups) ? data.groups.join(",") : data.groups,
```

Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

 **Backa fix 1** (återgå till original):
```bash
git restore client/src/lib/auth/userInforService.ts
```
#### Fix 2: GenericJsonFormView.tsx - JSONEditor skriver över DB-värde vid mount

Filen `client/src/views/generic/GenericJsonFormView.tsx` renderar JSONEditor med `initialJsonContent` som startvärde. När redigera-sidan laddas hämtas rätt data från databasen via `useEffect`, men JSONEditor anropar `onChange` direkt när den mountas och skriver då över det hämtade värdet med `initialJsonContent` (`{ Example: 'Example' }`). Resultatet är att editorn alltid visar standardvärdet istället för det sparade värdet.

```bash
micro ~/origo-admin/client/src/views/generic/GenericJsonFormView.tsx
```

Hitta raden:
```tsx
<JSONEditor value={jsonContent} onChange={handleOnChange} />
```

Ändra till:
```tsx
<JSONEditor key={JSON.stringify(jsonContent)} value={jsonContent} onChange={handleOnChange} />
```

Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

**Backa fix 2** (återgå till original):
```bash
git restore client/src/views/generic/GenericJsonFormView.tsx
```
#### Fix 3: Logotypens sökväg i Logo.tsx

Filen `client/src/components/Drawer/Logo/Logo.tsx` använder `LOGO`-värdet direkt utan att ta hänsyn till appens base path. När `LOGO=/img/admin_logo.png` och appen körs under `/admin` försöker Next.js image optimizer hämta `/img/admin_logo.png` (root) istället för `/admin/img/admin_logo.png`, vilket ger 400-fel i webbläsaren.

```bash
micro ~/origo-admin/client/src/components/Drawer/Logo/Logo.tsx
```

Hitta `useEffect`-blocket som hämtar logo-data:
```typescript
useEffect(() => {
  async function fetchLogoData() {
    const fetchedLogo = await envStore("LOGO");
    const width = await envStore("LOGO_WIDTH");
    const height = await envStore("LOGO_HEIGHT");
    if (fetchedLogo) {
      setLogo(fetchedLogo);
      setLogoWidth(Number(width));
      setLogoHeight(Number(height));
    }
  }

  fetchLogoData();
}, []);
```

Ändra till:

```typescript
useEffect(() => {
  async function fetchLogoData() {
    const fetchedLogo = await envStore("LOGO");
    const width = await envStore("LOGO_WIDTH");
    const height = await envStore("LOGO_HEIGHT");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    if (fetchedLogo) {
      const normalizedLogo =
        fetchedLogo.startsWith("/img/") ? `${basePath}${fetchedLogo}` : fetchedLogo;

      setLogo(normalizedLogo);
      setLogoWidth(Number(width));
      setLogoHeight(Number(height));
    }
  }

  fetchLogoData();
}, []);
```

Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

 **Backa fix 3** (återgå till original):
```bash
git restore client/src/components/Drawer/Logo/Logo.tsx
```
#### Fix 4: dataService.ts - WFS GetCapabilities och DescribeFeatureType stöder inte Geoserver

Filen `client/src/services/dataService.ts` har två buggar relaterade till WFS:

1. `formatWFSResponse` antar att GetCapabilities-svaret har rotelementet `WFS_Capabilities` utan namespace-prefix. Geoserver returnerar `wfs:WFS_Capabilities` med prefix, vilket gör att lager inte laddas.
2. `mapElementsToRecord` antar att DescribeFeatureType-svaret är från QGIS Server (med `schema.element` på toppnivån och `qgs:`-prefix). Geoserver returnerar `xsd:schema` med `xsd:`-prefix och utan toppnivå-element, vilket gör att attribut inte kan hämtas.

```bash
micro ~/origo-admin/client/src/services/dataService.ts
```

**Ändring 1** - ersätt:
```typescript
  const elements = data.schema.element;
  const complexTypes = data.schema.complexType;
```
med:
```typescript
  const schema = data['xsd:schema'] || data['xs:schema'] || data.schema;
  const elements = schema['xsd:element'] || schema['xs:element'] || schema.element;
  const complexTypes = schema['xsd:complexType'] || schema['xs:complexType'] || schema.complexType;
  if (!complexTypes) return elementsRecord;
```

**Ändring 2** - ersätt hela blocket från `const typeNameToElementName` till slutet av `complexTypes.forEach`:
```typescript
  const typeNameToElementName: Record<string, string> = {};
  elements.forEach((element: any) => {
    if (element.$.type && element.$.name) {
      typeNameToElementName[element.$.type] = element.$.name;
    }
  });

  complexTypes.forEach((complexType: any) => {
    const elementName = typeNameToElementName[`qgs:${complexType.$.name}`];
    if (elementName) {
      if (!elementsRecord[elementName]) {
        elementsRecord[elementName] = [];
      }
      const sequences = complexType?.complexContent?.[0]?.extension?.[0]?.sequence;
      if (sequences && sequences[0]?.element) {
        sequences[0].element.forEach((el: any) => {
          const elName = el.$?.name;
          const elType = el.$?.type;
          if (elName && elType) {
            elementsRecord[elementName].push(["name", elName]);
          }
        });
      }
    }
  });
```
med:
```typescript
  const typeNameToElementName: Record<string, string> = {};
  if (elements) {
    elements.forEach((element: any) => {
      if (element.$.type && element.$.name) {
        typeNameToElementName[element.$.type] = element.$.name;
      }
    });
  }

  complexTypes.forEach((complexType: any) => {
    const typeName = complexType.$?.name;
    if (!typeName) return;

    const qgsElementName = typeNameToElementName[`qgs:${typeName}`];
    const geoserverElementName = typeName.replace(/Type$/, '');
    const elementName = qgsElementName || geoserverElementName;

    if (!elementsRecord[elementName]) {
      elementsRecord[elementName] = [];
    }

    const complexContent = complexType['xsd:complexContent']?.[0] || complexType.complexContent?.[0];
    const extension = complexContent?.['xsd:extension']?.[0] || complexContent?.extension?.[0];
    const sequence = extension?.['xsd:sequence']?.[0] || extension?.sequence?.[0];
    const seqElements = sequence?.['xsd:element'] || sequence?.element;

    if (seqElements) {
      seqElements.forEach((el: any) => {
        const elName = el.$?.name;
        const elType = el.$?.type;
        if (elName && elType) {
          elementsRecord[elementName].push(["name", elName]);
        }
      });
    }
  });
```


**Ändring 3** - ersätt:
```typescript
  const featureTypes = response.WFS_Capabilities.FeatureTypeList[0].FeatureType;
```
med:
```typescript
  const capabilities = response['wfs:WFS_Capabilities'] || response.WFS_Capabilities;
  const featureTypes = capabilities.FeatureTypeList[0].FeatureType;
```

 **Backa fix 4** (återgå till original):
```bash
git restore client/src/services/dataService.ts
```

## FAS 6.1: Öppna proxy för publika kartinstanser

Som standard kräver proxyn att slutanvändaren är inloggad via OIDC för att kunna hämta en kartinstans. Utan denna ändring kan Origo-kartklienten inte visa kartan för oinloggade användare. GIS-lager som går via proxyn (`/proxy/gis/`) är fortfarande skyddade som tidigare.

Med denna ändring blir alla publicerade kartinstanser publika för oinloggade användare.

### Steg 1: Öppna filen

```bash
micro proxy/src/handlers/jsonProxyHandler.ts
```

### Steg 2: Gör ändringarna

**Ändring 1** - Hitta rad 60–65:

```typescript
            const token = extractTokenFromRequest(req);
            if (token === null) {
              res.writeHead(401, { "Content-Type": "text/plain" });
              res.end("Unauthorized");
              return;
            }
```

Ändra till:

```typescript
            const isPublicPath = originalUrl.pathname.includes("/published/");

            const token = extractTokenFromRequest(req);
            if (token === null && !isPublicPath) {
              res.writeHead(401, { "Content-Type": "text/plain" });
              res.end("Unauthorized");
              return;
            }
```


**Ändring 2** - Hitta rad 67–75:

```typescript
            let userInfo;
            try {
              userInfo = await userInfoService.getUserInfo(token.value, token.expiresIn);
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Error retrieving user info:`, error);
              res.writeHead(401, { "Content-Type": "text/plain" });
              res.end("Unauthorized");
              return;
            }
```

Ändra till:

```typescript
            let userInfo;
            if (token !== null) {
              try {
                userInfo = await userInfoService.getUserInfo(token.value, token.expiresIn);
              } catch (error) {
                console.error(`[${new Date().toISOString()}] Error retrieving user info:`, error);
                res.writeHead(401, { "Content-Type": "text/plain" });
                res.end("Unauthorized");
                return;
              }
            }
```


**Ändring 3** - Hitta rad 91:

```typescript
            let modifiedJson = await filterJsonService.filterJson(json, proxyBaseUrl, userInfo, cacheManager);
```

Ändra till:

```typescript
            let modifiedJson = userInfo
              ? await filterJsonService.filterJson(json, proxyBaseUrl, userInfo, cacheManager)
              : json;

            if (!userInfo && modifiedJson?.layers) {
              modifiedJson.layers = modifiedJson.layers.map((layer: any) => {
                const { id, layer_id, ...rest } = layer;
                if (layer_id !== null && layer_id !== undefined && layer_id !== "") {
                  return { ...rest, id: layer_id };
                } else {
                  return rest;
                }
              });
            }
```

Spara: `Ctrl+S` - Avsluta: `Ctrl+Q`

### Steg 3: Bygg om och starta proxy

```bash
origo-authentik build --no-cache proxy
origo-authentik up -d --force-recreate proxy
```

Vänta tills proxy:n är uppe:

```bash
origo-authentik ps proxy
```

### Verifiering

Kontrollera att ändringen är på plats:

```bash
grep -n "isPublicPath" proxy/src/handlers/jsonProxyHandler.ts
```

 **Obs:** Dessa ändringar måste återupprepas efter `git pull` om de skrivs över. Kontrollera med:
```bash
grep -n "isPublicPath" ~/origo-admin/proxy/src/handlers/jsonProxyHandler.ts
```

 **Backa** (återgå till original):
```bash
git restore proxy/src/handlers/jsonProxyHandler.ts
```

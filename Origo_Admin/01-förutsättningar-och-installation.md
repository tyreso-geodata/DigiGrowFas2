# Förutsättningar och installation

> **Index:** [00-översikt.md](./00-översikt.md)

## Förutsättningar

> I denna runbook används `<PUBLIK-URL>` som platshållare. Ersätt den genomgående med den faktiska URL:en (t.ex. `karta.kommun.se`).

### Disksökvägar

En sökväg behövs i VM:en:

|Platshållare|Syfte|Krav|Exempel|
|---|---|---|---|
|`<BACKUP-DIR>`|MongoDB-backuper och mediafiler|En katalog i VM:en med tillräckligt diskutrymme|`/opt/backups`|

> **Obs:** Tyresö IT hanterar VM-backup på vCenter-nivå. Applikationsbackupen (MongoDB + mediafiler) sparas lokalt i VM:en och hanteras av ett cron-skript.

## FAS 1: Ta emot VM från Tyresö IT

VM:en skapas och konfigureras av Tyresö IT enligt följande specifikation som ska vara levererad innan installationen påbörjas:

- Ubuntu Server 24.04 LTS installerat
- Minst 2 vCPU, 4 GB RAM, 50 GB disk (test) / 100 GB disk (prod)
- Statisk IP-adress
- OpenSSH installerat och aktiverat
- SSH-åtkomst (port 22) öppen från internt nät
- Port 3000, 3010 och 3020 öppna från IIS-servern till VM:en
- Port 3050 öppen från hela det interna nätverket samt Swecos nätverk (tillfälligt, stängs efter AD-integration)
- VM-namn: `origo-admin-test` och `origo-admin-prod`

### 1.1 Verifiera leveransen

När Tyresö IT meddelar att VM:en är klar, logga in via SSH och verifiera:

```bash
ssh användarnamn@<VM-IP>
```

```bash
# Kontrollera IP och nätverk
ip addr
ping -c 3 archive.ubuntu.com

# Kontrollera OS-version
lsb_release -a
# Ska visa: Ubuntu 24.04 LTS

# Kontrollera diskutrymme
df -h
```

Notera VM:ens IP-adress och användarnamnet - båda behövs i resterande steg.

> Om något inte stämmer (fel OS-version, saknad nätverksåtkomst etc.) kontakta Tyresö IT innan du fortsätter.

## FAS 2: Terminalverktyg & Docker

Logga in via SSH från Windows-servern:

```bash
ssh användarnamn@<VM-IP>
```

### 2.1 Installera grundpaket och Docker

```bash
# Uppdatera och installera grundpaket
sudo apt-get update
sudo apt-get install -y micro git ca-certificates curl gnupg

# Dockers GPG-nyckel
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker-repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installera Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Grupprättigheter
sudo usermod -aG docker $USER
```

> `docker-compose-plugin` installerar Docker Compose v2. Kommandon skrivs som `docker compose` (med mellanslag).

> **Kritiskt:** Logga ut och in igen för att aktivera gruppmedlemskapet:

```bash
exit
# Logga in igen via SSH
```

### 2.2 Verifiera Docker

```bash
docker --version
docker compose version
docker ps
# Förväntat: tom tabell, INTE "permission denied"
```

### 2.3 Skapa shell-alias för Docker Compose

Eftersom repo-filer inte ändras och vi använder en lokal override-fil behöver alla `docker compose`-kommandon explicita `-f`-flaggor. Skapa alias för att förenkla:

```bash
micro ~/.bash_aliases
```

Klistra in:

```bash
alias origo-authentik='docker compose -f docker-compose.yaml -f docker-compose.override.yaml -f docker-compose.override.local.yaml'

```

Aktivera:

```bash
source ~/.bash_aliases
```

> **Obs:** Repot klonas först i Fas 3 - du behöver inte ha gjort det än. Aliasen är bara definitioner och kan skapas när som helst.
>
> **Viktigt:** Aliasen förutsätter att du står i projektkatalogen (`~/origo-admin`) när du använder dem. Alla `origo-authentik`-kommandon i denna runbook kräver att du först kört `cd ~/origo-admin`. Det påminns om detta i Fas 3 när det blir aktuellt.

> **Varför explicita `-f`-flaggor?** Docker Compose laddar automatiskt `docker-compose.yaml` + `docker-compose.override.yaml`. Explicita flaggor ger full kontroll över exakt vilka filer som används.

## FAS 3: Klona repo, bygg images & konfigurera Authentik

### 3.1 Klona och förbered

```bash
git clone https://github.com/haninge-geodata/origo-admin.git
cd ~/origo-admin
cp .env.template .env
chmod 600 .env
```

### 3.2 Exkludera lokala filer från git

```bash
echo "docker-compose.override.local.yaml" >> .git/info/exclude
```

> `.git/info/exclude` fungerar som `.gitignore` men är lokalt per klon och versionshanteras inte. Det innebär att vi inte ändrar någon repo-fil, och att `git pull` aldrig ger konflikter.

### 3.3 Generera TOKEN_SECRET och uppdatera .env

Generera en hemlig nyckel för JWT-token-signering direkt på Ubuntu-hosten:

```bash
openssl rand -hex 32
```

Kopiera den utskrivna strängen (t.ex. `a3f8b2c1d4e5...`).

Öppna `.env` och sätt `TOKEN_SECRET`:

```bash
micro .env
```

|Variabel|Värde|
|---|---|
|`TOKEN_SECRET`|Nyckeln från `openssl rand -hex 32` ovan|

> **Obs:** `NEXTAUTH_SECRET` behöver inte sättas manuellt - `docker-compose.yaml` sätter den automatiskt till `${TOKEN_SECRET}`. Det räcker att sätta `TOKEN_SECRET` i `.env`.

> Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

### 3.4 Skapa docker-compose.override.local.yaml

Innan du öppnar filen, ta fram alla värden du behöver ha redo:

**1. Bestäm ett starkt MongoDB-lösenord** och spara det i en lösenordshanterare. Det används på två ställen i filen och återkommer i flera kommandon senare i runbooken.

**2. Generera Authentik-nyckel:**

```bash
openssl rand -hex 32
```

Kopiera resultatet - det används på två ställen i filen (`idp` och `idp-worker`).

**3. Ha följande redo:**

| Värde                       | Källa                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `<STARKT-MONGODB-LÖSENORD>` | Bestämt i steg 1 ovan                                        |
| `<GENERERAD-NYCKEL>`        | Resultatet från `openssl rand -hex 32` ovan                  |
| `<PUBLIK-URL>`     | Tyresö publika URL utan protokoll (t.ex. `karta.kommun.se`) |
| `<VM-IP>`              | IP-adressen du fick för SSH                                  |

Skapa nu filen:

```bash
micro docker-compose.override.local.yaml
```

Fyll i alla värden direkt:

```yaml
services:
  mongodb:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    environment:
      MONGO_INITDB_ROOT_PASSWORD: "<MONGODB-LÖSENORD>"

  server:
    build:
      args:
        NODE_ENV: development
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    environment:
      NODE_ENV: "production"
      HOST: "<PUBLIK-URL>"
      PROTOCOL: "https"
      DATABASE: "mongodb://root:<MONGODB-LÖSENORD>@mongodb/origoadmin?authSource=admin"
      MAPINSTANCE_ROUTE_PATH: "http://<PUBLIK-URL>/proxy/mapinstances"

  client:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    environment:
      NEXT_PUBLIC_BASE_PATH: "/admin"
      NEXT_PUBLIC_PROXY_URL: "/admin/api/proxy"
      NEXTAUTH_URL: "https://<PUBLIK-URL>/admin/api/auth"
      ORIGO_URL: "https://<PUBLIK-URL>/#map=https://<PUBLIK-URL>/proxy/mapinstances"
      SIGN_OUT_URL: "http://<VM-IP>:3050/application/o/origo-admin/end-session/"
      PROTECTED_IDP_AUTH_URL: "http://<VM-IP>:3050/application/o/authorize/"
      PROTECTED_IDP_REDIRECT_URI: "https://<PUBLIK-URL>/admin/api/auth/callback/oidc"
      PROTECTED_IDP_ISSUER: "http://<VM-IP>:3050/application/o/origo-admin/"
      PROTECTED_IDP_TOKEN_URL: "http://<VM-IP>:3050/application/o/token/"
      PROTECTED_IDP_USERINFO_URL: "http://<VM-IP>:3050/application/o/userinfo/"
      PROTECTED_IDP_JWKS_URL: "http://<VM-IP>:3050/application/o/origo-admin/jwks/"
      PROTECTED_IDP_WELL_KNOWN: "http://<VM-IP>:3050/application/o/origo-admin/.well-known/openid-configuration"
      PROTECTED_IDP_SCOPE: "openid email profile groups"
      PROTECTED_IDP_SESSION_MAXAGE: 28800

  proxy:
    build:
      args:
        NODE_ENV: development
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    environment:
      HOST: "https://<PUBLIK-URL>"
      AUTH_CLIENT_DOMAIN: "<PUBLIK-URL>"
      REDIRECT_URI: "https://<PUBLIK-URL>/admin"

  idp:
    environment:
      AUTHENTIK_WEB__PATH: "https://<PUBLIK-URL>/"
      AUTHENTIK_SECRET_KEY: "<AUTHENTIK-SECRET-KEY>"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  idp-worker:
    environment:
      AUTHENTIK_SECRET_KEY: "<AUTHENTIK-SECRET-KEY>"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  idp-db:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  idp-redis:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

> **Obs:** `SIGN_OUT_URL` och `PROTECTED_IDP_AUTH_URL` pekar fortfarande på `http://<VM-IP>:3050` - dessa ändras **inte** till https. Authentik körs utan TLS direkt på VM:en och nås av webbläsaren direkt, inte via IIS.

> **Kritiskt - NEXTAUTH_URL:** NextAuth v4-dokumentationen säger att när appen använder custom base path ska `NEXTAUTH_URL` peka på hela auth-endpointen: `https://<PUBLIK-URL>/admin/api/auth` - inte bara `http(s)://<PUBLIK-URL>/admin`. Utan `/api/auth` på slutet misslyckas CSRF-validering bakom IIS reverse proxy.

> **Kritiskt - NEXT_PUBLIC_PROXY_URL:** Måste sättas till `/admin/api/proxy` (relativ sökväg med basePath). Om den sätts till en absolut URL (t.ex. `https://<PUBLIK-URL>/api/proxy`) eller till Docker-intern adress (`http://server:3010/api/proxy`) fungerar inte proxy-anropen från webbläsaren. Värdet bäddas in vid byggtid via `client/.env.production` (steg 3.6) - att sätta den i override-filen enbart räcker inte.

> **Kritiskt - PROTECTED_IDP_SCOPE:** Måste inkludera `groups`. Utan `groups` i scopet returnerar Authentik inget `groups`-fält i userinfo-svaret, vilket gör att behörighetskontrollen misslyckas.

> **Viktigt:** `AUTH_CLIENT_DOMAIN` ska vara domännamnet **utan protokoll** (t.ex. `karta.kommun.se`, inte `http://karta.kommun.se`). Proxy-servern använder den för CORS-origin och cookie-domän.

> **Säkerhetsvarning:** Repo-filen `docker-compose.override.yaml` har en hårdkodad `AUTHENTIK_SECRET_KEY`. Den lokala overriden överskriver den automatiskt (Docker Compose: senare filer har företräde).

> Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

Skydda filen:

```bash
chmod 600 docker-compose.override.local.yaml
```

### 3.5 Skapa client/.env.production

`NEXT_PUBLIC_BASE_PATH` och `NEXT_PUBLIC_PROXY_URL` måste vara kända när Next.js-klienten byggs - de är build-time-variabler som bäddas in i den kompilerade koden. Klientens `Dockerfile` saknar dessa som ARG (bugg i repot), men Next.js läser automatiskt från `.env.production` i projektkatalogen vid byggtid. Vi skapar därför filen lokalt och exkluderar den från git:

```bash
cat > client/.env.production << 'EOF'
NEXT_PUBLIC_BASE_PATH=/admin
NEXT_PUBLIC_PROXY_URL=/admin/api/proxy
EOF
echo "client/.env.production" >> .git/info/exclude
```

Verifiera:

```bash
cat client/.env.production
# Ska visa:
# NEXT_PUBLIC_BASE_PATH=/admin
# NEXT_PUBLIC_PROXY_URL=/admin/api/proxy
```

> Utan detta steg bäddas inte `NEXT_PUBLIC_PROXY_URL` in i bygget korrekt, vilket gör att webbläsaren försöker nå `server:3010` (Docker-intern adress) direkt - något som inte fungerar utanför Docker-nätverket.

> **Kritiskt - innan du fortsätter:** Källkodsfixarna i [02-källkodsfixar.md](02-källkodsfixar.md) måste göras nu, innan bygget i steg 3.6. Gå dit, gör alla fyra buggfixarna, och kom sedan tillbaka hit.

### 3.6 Bygg Docker-images

```bash
origo-authentik build --no-cache
```

Bygget kan ta **5–15 minuter**. Verifiera:

```bash
docker images | grep origo-admin
# Bör visa: origo-admin-client, origo-admin-server, origo-admin-proxy
```

### 3.7 Starta Authentik

```bash
origo-authentik up -d idp idp-worker
```

Detta startar automatiskt fyra containrar via beroenden: `idp`, `idp-worker`, `idp-db`, `idp-redis`.

Vänta 1–2 minuter och kontrollera:

```bash
origo-authentik ps
```

Alla fyra ska ha status **Up** eller **healthy**.

> **Obs:** Vid första uppstarten kan `idp` visa **unhealthy** i flera minuter medan Authentik initialiserar sin databas. Det är normalt. Upprepa `origo-authentik ps` var 30:e sekund tills den byter till **healthy** innan du fortsätter. Om den fortfarande är unhealthy efter 5–10 minuter, kontrollera loggarna: `origo-authentik logs --tail=50 idp`

### 3.8 Skapa admin-konto i Authentik

Öppna en webbläsare på Windows-servern och gå till:

```
http://<VM-IP>:3050/if/flow/initial-setup/
```

Authentik skapar automatiskt standardanvändaren `akadmin`. Ange e-postadress och ett starkt lösenord. Användarnamnet `akadmin` används som det är - det är detta namn som refereras i steg 4.4 och ska inte ändras.

> **E-postadress:** Authentik kräver att fältet är ifyllt men adressen används aldrig för faktisk e-post. Använd `admin@origo-admin.local` som generiskt värde.

> **Viktigt:** Spara lösenordet för `akadmin` i en lösenordshanterare omedelbart. **Logga alltid in med användarnamnet `akadmin`**, inte med e-postadressen - Authentik returnerar olika värden för `sub` beroende på inloggningsmetod.

### 3.9 Skapa OIDC-applikation i Authentik

1. Öppna **"Admin interface"** i Authentik: `http://<VM-IP>:3050/if/admin/`
2. **"Applications"** > **"Create with Wizard"**.
3. Namn: **"Origo Admin"**, slug: **"origo-admin"**. Lämna **Group** tomt. **Policy engine mode**: `any`. Gå vidare.
4. Välj **OAuth2/OpenID Provider**.
5. **Name**: `Provider for Origo Admin`. **Authorization flow**: `default-provider-authorization-implicit-consent`. **Client type**: `Public`.
6. **Redirect URIs/Origins**: typ **Regex**, värde `.*`
7. **"Advanced protocol settings"** > **Access Token validity**: **hours=8** 
8. **"Advanced protocol settings"** > **"Subject mode"**: **"Based on User's username"**.
9. **"Submit"**.
10. **Applications** > **Providers** > klicka på **Provider for Origo Admin**: **Kopiera Client ID.**

> **Varför Subject mode "Based on User's username"?** Detta säkerställer att `sub`-fältet i userinfo-svaret innehåller användarnamnet (`akadmin`) och inte ett UUID eller e-postadress, vilket matchar hur MongoDB-rollen konfigureras i steg 4.4.


## FAS 4: Starta Origo Admin

### 4.1 Uppdatera .env med IDP_CLIENT_ID och IDP_CLIENT_SECRET

```bash
micro .env
```

Sätt följande:

| Variabel        | Värde                                |
| --------------- | ------------------------------------ |
| `TOKEN_SECRET`  | (redan satt i steg 3.3)              |
| `IDP_CLIENT_ID` | Client ID från Authentik (steg 3.9) |

> `IDP_CLIENT_SECRET` ska lämnas **tom** eftersom Authentik konfigurerades med Public client type.

> Spara: `Ctrl+S`, Avsluta: `Ctrl+Q`

### 4.2 Starta server och generera API-token

```bash
origo-authentik up -d server
```

Vänta tills servern är healthy:

```bash
# Upprepa tills STATUS visar "(healthy)"
origo-authentik ps server

# Eller testa manuellt:
curl -s http://localhost:3010/api/swagger > /dev/null && echo "Server redo" || echo "Vänta..."
```

Generera API-token:

```bash
origo-authentik exec server node dist/server/src/scripts/generateInitialToken.js
```

Kommandot skriver ut något i stil med:

```
[2026-03-05T10:00:00.000Z] Initial Super Admin Token created
[2026-03-05T10:00:00.000Z] API_ACCESS_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
[2026-03-05T10:00:00.000Z] Please store this token securely. It will not be shown again.
```

Kopiera hela token-strängen (allt efter `API_ACCESS_TOKEN=`).

> **Säkerhetsvarning:** Super admin-token med full åtkomst. Visas bara en gång, så spara den!

> **Om sökvägen är fel och kommandot inte hittar filen**, hitta rätt sökväg inne i containern:
>
> ```bash
> origo-authentik exec server find / -name "generateInitialToken.js" 2>/dev/null
> ```
>
> Kopiera den sökväg som returneras och ersätt i kommandot ovan.

### 4.3 Sätt API_ACCESS_TOKEN i .env

```bash
micro .env
# Sätt API_ACCESS_TOKEN=<token från steg 4.2>
```

> Måste vara satt innan klient och proxy startas.

### 4.4 Skapa initial admin-roll i MongoDB

Origo Admin hanterar behörigheter internt i MongoDB - det räcker inte att vara inloggad via Authentik för att få administratörsbehörighet. Applikationen kontrollerar om den inloggade användaren finns listad som `actor` i en roll med namnet `Administratör` i databasen. Utan denna post kommer `akadmin` att kunna logga in men inte ha tillgång till något i gränssnittet.

```bash
origo-authentik exec mongodb mongosh "mongodb://root:<MONGODB-LÖSENORD>@localhost/origoadmin?authSource=admin" --eval 'db.getCollection("roles").insertOne({actors: [{"name": "akadmin", "type": "User"}, {"name": "authentik Default Admin", "type": "User"}], permissions: [], role: "Administratör"})'
```

> Ersätt `<MONGODB-LÖSENORD>` med lösenordet du satte i `docker-compose.override.local.yaml` (steg 3.4). Authentik kan returnera antingen `akadmin` eller `authentik Default Admin` som `sub` beroende på inloggningsmetod - båda läggs till för att säkerställa att inloggning fungerar oavsett vilket värde som returneras.

### 4.5 Starta klient och proxy

```bash
origo-authentik up -d client proxy
```

Kontrollera:

```bash
origo-authentik ps
```

Förväntade tjänster:

|Tjänst|Port|Roll|
|---|---|---|
|`mongodb`|27017|Databas|
|`server`|3010|Backend-API|
|`client`|3000|Admin-gränssnitt|
|`proxy`|3020|Kartkonfigurationer|
|`idp`|3050|Authentik (IdP)|
|`idp-worker`|-|Authentik bakgrund|
|`idp-db`|-|PostgreSQL (Authentik)|
|`idp-redis`|-|Redis (Authentik)|

### 4.6 Verifiera lokalt

```bash
curl http://localhost:3000
```

Du bör få ett HTML-svar.

### 4.7 Verifiera omstart

```bash
sudo reboot
# Vänta, logga in igen
cd ~/origo-admin
origo-authentik ps
# Alla tjänster ska ha startat automatiskt (restart: always)
```

Kontrollera att logg-rotation är aktivt:

```bash
docker inspect --format='{{.HostConfig.LogConfig}}' origo-admin-server-1
# Bör visa: {json-file map[max-file:3 max-size:10m]}
```

## FAS 5: IIS Reverse Proxy (Windows Server)

### 5.1 Kontrollera och installera IIS-moduler

Kontrollera först om modulerna redan finns. Kör i PowerShell som admin:

```powershell
# URL Rewrite
Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite" -ErrorAction SilentlyContinue | Select-Object Version

# Application Request Routing (ARR)
Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing" -ErrorAction SilentlyContinue | Select-Object Version
```

Du kan även öppna **IIS Manager**, markera servern och se i feature-listan: **URL Rewrite** och **Application Request Routing Cache** ska synas som ikoner. Om de saknas, installera:

- **URL Rewrite Module**: https://www.iis.net/downloads/microsoft/url-rewrite
- **Application Request Routing (ARR) 3.0**: https://www.iis.net/downloads/microsoft/application-request-routing

### 5.2 Aktivera Proxy i IIS

1. **IIS Manager** > Markera servern.
2. Öppna **Application Request Routing Cache**.
3. **Server Proxy Settings** > Bocka i **Enable proxy**.
4. Bocka i **Preserve host header** om alternativet finns (kritiskt för OIDC-redirects och cookies). I vissa versioner av ARR saknas detta alternativ - fortsätt i så fall utan det.
5. **Apply**.

### 5.3 Skapa Reverse Proxy-regler

Alla regler skapas på IIS-siten (t.ex. `karta.kommun.se`). Ersätt `<VM-IP>` med Ubuntu-VM:ens IP.

> **Obs:** Rewrite URL:erna pekar alltid mot VM:en via HTTP internt - oavsett om den publika siten kör HTTP eller HTTPS. SSL termineras på IIS.


**Så här skapar du varje regel:**

1. Öppna **IIS Manager** och klicka på **siten** i vänstermenyn.
2. Dubbelklicka på **URL Rewrite** i mitten.
3. Klicka på **Add Rule(s)...** i högerpanelen.
4. Välj **Blank rule** under _Inbound rules_ och klicka **OK**.
5. Fyll i fälten enligt tabellen för respektive regel nedan.
6. Bocka i **Append query string** och **Stop processing of subsequent rules**. (**Gäller endast rewrite-regler 2, 3 och 4 inte regel 1.**)
7. Klicka **Apply** i högerpanelen.


**Regel 1: Authentik Authorize**

| Fält          | Värde                                     |
| ------------- | ----------------------------------------- |
| Name          | `Authentik Authorize`                     |
| Pattern       | `^application/o/(.*)`                     |
| Action type   | Redirect                                  |
| Redirect URL  | `http://<VM-IP>:3050/application/o/{R:1}` |
| Redirect type | Temporary (307)                           |
|               |                                           |

> NextAuth 4 bygger authorize-URL:en med hosten från `NEXTAUTH_URL` (den publika domänen) istället för `PROTECTED_IDP_AUTH_URL` (VM:ens IP). Utan denna regel hamnar webbläsaren på `https://<PUBLIK-URL>/application/o/authorize/...` som inte finns på IIS → 404. Regeln fångar detta och redirectar webbläsaren till Authentik på VM:en.



**Regel 2: Origo Admin**

| Fält        | Värde                                 |
| ----------- | ------------------------------------- |
| Name        | `Origo Admin`                         |
| Pattern     | `^admin(.*)`                          |
| Action type | Rewrite                               |
| Rewrite URL | `http://<VM-IP>:3000/admin{R:1}` |
| Name                     | Value           | Replace |
| ------------------------ | --------------- | ------- |
| `HTTP_X_FORWARDED_PROTO` | `https`         | `True`  |
| `HTTP_X_FORWARDED_HOST`  | `{HTTP_HOST}`   | `True`  |
| `HTTP_X_FORWARDED_FOR`   | `{REMOTE_ADDR}` | `True`  |

> Hanterar även `/admin/api/proxy`-anrop från webbläsaren - Next.js tar hand om dem internt på port 3000. Ingen separat regel för `/api/proxy` behövs.



**Regel 3: Origo Admin Proxy**

| Fält        | Värde                                 |
| ----------- | ------------------------------------- |
| Name        | `Origo Admin Proxy`                   |
| Pattern     | `^proxy(.*)`                          |
| Action type | Rewrite                               |
| Rewrite URL | `http://<VM-IP>:3020/proxy{R:1}` |
|             |                                       |
| Name                     | Value           | Replace |
| ------------------------ | --------------- | ------- |
| `HTTP_X_FORWARDED_PROTO` | `https`         | `True`  |
| `HTTP_X_FORWARDED_HOST`  | `{HTTP_HOST}`   | `True`  |
| `HTTP_X_FORWARDED_FOR`   | `{REMOTE_ADDR}` | `True`  |

**Regel 4: Origo Admin API**

| Fält        | Värde                               |
| ----------- | ----------------------------------- |
| Name        | `Origo Admin API`                   |
| Pattern     | `^api(.*)`                          |
| Action type | Rewrite                             |
| Rewrite URL | `http://<VM-IP>:3010/api{R:1}` |
| Name                     | Value           | Replace |
| ------------------------ | --------------- | ------- |
| `HTTP_X_FORWARDED_PROTO` | `https`         | `True`  |
| `HTTP_X_FORWARDED_HOST`  | `{HTTP_HOST}`   | `True`  |
| `HTTP_X_FORWARDED_FOR`   | `{REMOTE_ADDR}` | `True`  |

> **Regelordningen spelar roll.** Kontrollera att **Authentik Authorize** ligger överst, följt av de tre Origo Admin-reglerna. Alla fyra ska ligga ovanför eventuella catch-all-regler - en vanlig sådan är en HTTPS-redirect med mönstret `(.*)`. Flytta vid behov reglerna uppåt med pilarna i högerpanelen i URL Rewrite.

## Nästa steg

IIS och Origo Admin är nu uppe. Fortsätt i denna ordning:

1. **[02-källkodsfixar.md](02-källkodsfixar.md) - Fas 6.1:** Öppna proxyn för publika kartinstanser och bygg om proxy-containern.
2. **[03-kartklient-och-lager.md](03-kartklient-och-lager.md):** Skapa kartinstanser och koppla Origo-kartklienten.

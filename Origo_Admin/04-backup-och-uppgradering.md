# Backup och uppgradering

> **Index:** [00-översikt.md](./00-översikt.md)

## FAS 7: Backup

Origo Admin lagrar kartkonfiguration i MongoDB och uppladdade mediafiler (ikoner, symbolbilder etc.) i Docker-volymen `uploads_data`. Metadata i MongoDB refererar till filer på disk, så de måste backas upp tillsammans.

Tyresö IT ansvarar för VM-backup på vCenter-nivå. Den backupen skyddar mot total VM-krasch eller diskhavereri. Applikationsbackupen nedan är ett komplement som skyddar mot dataförlust på applikationsnivå, exempelvis om en felaktig konfigurationsändring görs eller om någon av misstag kör `docker compose down -v`.

| Backup-typ                    | Vad                                  | Frekvens             | Skyddar mot                         |
| ----------------------------- | ------------------------------------ | -------------------- | ----------------------------------- |
| **Daglig applikationsbackup** | MongoDB-dump + uppladdade mediafiler | Dagligen kl 02:00    | Dataförlust, felaktig konfiguration |
| **VM-backup (Tyresö IT)**     | Hela VM:en                           | Enligt Tyresö policy | Total VM-krasch, korrupt disk       |

### 7.1 Skapa backup-kataloger

```bash
sudo mkdir -p /opt/backups/mongodb
sudo mkdir -p /opt/backups/uploads
sudo chown $USER:$USER /opt/backups/mongodb
sudo chown $USER:$USER /opt/backups/uploads
```

### 7.2 Skapa backup-skript

```bash
# Kör pwd för att se din nuvarande sökväg. Uppdatera PROJECT_DIR i skriptet nedan om den skiljer sig från /home/origoadmin/origo-admin
pwd
```

```bash
micro /opt/backups/mongodb/backup.sh
```

Klistra in och **anpassa** `BACKUP_NAME`, `PROJECT_DIR` och MongoDB-lösenordet:

```bash
#!/bin/bash
# Origo Admin backup
# Daglig backup av MongoDB + uppladdade mediafiler + konfigurationsfiler
# Sparas lokalt i VM. VM-backup hanteras av Tyresö IT via vCenter.
# Roterar och behåller de 5 senaste lokalt.

BACKUP_DIR="/opt/backups/mongodb"
UPLOADS_BACKUP_DIR="/opt/backups/uploads"
TIMESTAMP=$(date +%Y%m%d_%H%M)
BACKUP_NAME="origo-backup-prod"   # Byt till origo-backup-test för testmiljön

# KRITISKT: Ange fullständig sökväg till projektmappen "origo-admin".  
# Logga in och kör "pwd" för att se din katalog och "ls" för att se innehållet.  
# Om du ser "origo-admin" där, använd: <pwd>/origo-admin  
# Exempel: /home/origoadmin/origo-admin  
PROJECT_DIR="/home/origoadmin/origo-admin"

# Compose-filer
COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.override.yaml -f docker-compose.override.local.yaml"

cd "$PROJECT_DIR" || exit 1

# --- MongoDB-backup ---
docker compose $COMPOSE_FILES exec -T mongodb mongodump --uri="mongodb://root:<MONGODB-LÖSENORD>@localhost/origoadmin?authSource=admin" --archive --gzip > "$BACKUP_DIR/$BACKUP_NAME-$TIMESTAMP.gz"

if [ $? -eq 0 ]; then
  echo "$(date): MongoDB backup OK - $BACKUP_NAME-$TIMESTAMP.gz" >> "$BACKUP_DIR/backup.log"
else
  echo "$(date): MONGODB BACKUP MISSLYCKADES" >> "$BACKUP_DIR/backup.log"
  exit 1
fi

# --- Mediafiler-backup (uploads_data-volymen) ---
docker compose $COMPOSE_FILES exec -T server tar czf - -C /data/uploads . > "$UPLOADS_BACKUP_DIR/$BACKUP_NAME-uploads-$TIMESTAMP.tar.gz"

if [ $? -eq 0 ]; then
  echo "$(date): Uploads backup OK - $BACKUP_NAME-uploads-$TIMESTAMP.tar.gz" >> "$BACKUP_DIR/backup.log"
else
  echo "$(date): UPLOADS BACKUP MISSLYCKADES" >> "$BACKUP_DIR/backup.log"
fi

# --- Konfigurationsfiler-backup ---
cp "$PROJECT_DIR/.env" "$BACKUP_DIR/$BACKUP_NAME-env-$TIMESTAMP"
cp "$PROJECT_DIR/docker-compose.override.local.yaml" "$BACKUP_DIR/$BACKUP_NAME-override-$TIMESTAMP.yaml"
echo "$(date): Konfigurationsfiler säkerhetskopierade" >> "$BACKUP_DIR/backup.log"

# --- Rotera lokalt (behåll 5 senaste) ---
ls -t "$BACKUP_DIR"/$BACKUP_NAME-[0-9]*.gz 2>/dev/null | tail -n +6 | xargs -r rm
ls -t "$UPLOADS_BACKUP_DIR"/$BACKUP_NAME-uploads-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm
ls -t "$BACKUP_DIR"/$BACKUP_NAME-env-* 2>/dev/null | tail -n +6 | xargs -r rm
ls -t "$BACKUP_DIR"/$BACKUP_NAME-override-*.yaml 2>/dev/null | tail -n +6 | xargs -r rm
```


```bash
chmod +x /opt/backups/mongodb/backup.sh
```

### 7.3 Schemalägg med cron

```bash
crontab -e
```
- Välj editor: `Micro` 

Lägg till längst ner i filen:

```
0 2 * * * /opt/backups/mongodb/backup.sh
```

### 7.4 Testa manuellt

```bash
/opt/backups/mongodb/backup.sh
ls -la /opt/backups/mongodb/
ls -la /opt/backups/uploads/
cat /opt/backups/mongodb/backup.log
```

### 7.5 Återställning

> **Viktigt:** Återställ alltid MongoDB och mediafiler från samma tidpunkt.
#### MongoDB

Lista tillgängliga backuper (senaste först):
Ändra till test eller prod
```bash
ls -lt /opt/backups/mongodb/origo-backup-prod-*.gz | head -5
```

```bash
cd ~/origo-admin
origo-authentik exec -T mongodb mongorestore --uri="mongodb://root:<MONGODB-LÖSENORD>@localhost/origoadmin?authSource=admin" --gzip --drop --archive < /opt/backups/mongodb/origo-backup-prod-<ÅÅÅÅMMDD_HHMM>.gz
```

#### Mediafiler (uploads)

```bash
ls -lt /opt/backups/uploads/origo-backup-prod-uploads-*.tar.gz | head -5
```

```bash
cd ~/origo-admin
origo-authentik exec -T server sh -c "rm -rf /data/uploads/* && tar xzf - -C /data/uploads" < /opt/backups/uploads/origo-backup-prod-uploads-<ÅÅÅÅMMDD_HHMM>.tar.gz
```

> **Viktigt:** Återställ alltid MongoDB och mediafiler från samma tidpunkt.

## FAS 8: Uppdateringsrutin

När repot uppdateras (buggfixar, nya funktioner):

> **Obs:** Kommandona nedan använder `origo-authentik`.

### 8.1 Uppdatera

```bash
git pull
```

> **Viktigt:** Kontrollera efter `git pull` att alla buggfixarna i [02-källkodsfixar.md](02-källkodsfixar.md) och proxy-ändringen (Fas 6.1 i samma fil) finns kvar. Om `git pull` skriver över dem, gör om ändringarna:
>
> ```bash
> # Kontrollera fix 1
> grep "Array.isArray" ~/origo-admin/client/src/lib/auth/userInforService.ts
> # Kontrollera fix 2
> grep "JSON.stringify(jsonContent)" ~/origo-admin/client/src/views/generic/GenericJsonFormView.tsx
> # Kontrollera fix 3
> grep "normalizedLogo" ~/origo-admin/client/src/components/Drawer/Logo/Logo.tsx
> # Kontrollera fix 4
> grep "wfs:WFS_Capabilities" ~/origo-admin/client/src/services/dataService.ts
> # Kontrollera proxy-ändring
> grep "isPublicPath" ~/origo-admin/proxy/src/handlers/jsonProxyHandler.ts
> ```
>
> Om något saknas - återskapa respektive fix enligt [02-källkodsfixar.md](02-källkodsfixar.md).

```bash
origo-authentik build --no-cache
origo-authentik up -d --force-recreate
```

### 8.2 Verifiera

```bash
origo-authentik ps
curl http://localhost:3000
```

> **Obs:** Efter ombygge kan gamla cookies orsaka `User not authorized`. Rensa cookies och session i webbläsaren om inloggning inte fungerar efter ett nytt bygge.

> **Kör aldrig `origo-authentik down -v` i produktion.** Flaggan `-v` tar bort volymer (inklusive MongoDB-data och uppladdade filer).

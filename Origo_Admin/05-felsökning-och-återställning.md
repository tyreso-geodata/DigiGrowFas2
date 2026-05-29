# RUNBOOK: Felsökning och återställning

> **Index:** [00-översikt.md](./00-översikt.md)

## FAS 10: Snabbåterställning (applikationskrasch)

### Bedöm situationen

|Symptom|Trolig orsak|Gå till|
|---|---|---|
|En eller flera containrar startar inte|Felaktig config i override/env|Steg A|
|`origo-authentik ps` visar inga containrar alls|Compose-filer saknas/trasiga|Steg B|
|Containrar uppe men datan är borta/felaktig|Någon kört `down -v` eller ändrat i DB|Steg C|
|Docker själv fungerar inte|Docker-daemon kraschad|Steg D|
|VM:en startar inte / disk trasig|VM-krasch|Fas 11|

### Steg A: Felaktig konfiguration

```bash
cd ~/origo-admin
origo-authentik logs --tail=50 server
origo-authentik logs --tail=50 client
git status
# git checkout . återställer ALLA ändringar inklusive buggfixarna i 02-källkodsfixar.md
# Återskapa buggfixar efteråt om nödvändigt (se 02-källkodsfixar.md)
micro .env
micro docker-compose.override.local.yaml
origo-authentik down
origo-authentik up -d
origo-authentik ps
```

> **Viktigt:** Om du kör `git checkout .` för att återställa repo-filer skrivs alla buggfixarna i [02-källkodsfixar.md](02-källkodsfixar.md) över. Återskapa dem och bygg om.

### Steg B: Återställ konfiguration från repo + backup

```bash
cd ~/origo-admin

# Återställ alla repo-filer till känt tillstånd
git checkout .

# Återskapa buggfixar som skrevs över av git checkout (se 02-källkodsfixar.md)
# Fix 1: userInforService.ts
# Fix 2: GenericJsonFormView.tsx
# Fix 3: Logo.tsx
# Fix 4: dataService.ts

# Hämta senaste backup av konfigurationsfilerna
ls -lt /opt/backups/mongodb/origo-backup-prod-env-* | head -5
ls -lt /opt/backups/mongodb/origo-backup-prod-override-*.yaml | head -5

# Kopiera senaste versionen (ersätt tidsstämpel med den du vill använda)
cp /opt/backups/mongodb/origo-backup-prod-env-<ÅÅÅÅMMDD_HHMM> .env
cp /opt/backups/mongodb/origo-backup-prod-override-<ÅÅÅÅMMDD_HHMM>.yaml docker-compose.override.local.yaml
chmod 600 .env docker-compose.override.local.yaml

origo-authentik up -d
origo-authentik ps
```

> Om backup saknas, återskapa `.env` från mall och fyll i värdena:
> 
> ```bash
> cp .env.template .env
> chmod 600 .env
> micro .env
> # Fyll i: TOKEN_SECRET, IDP_CLIENT_ID, IDP_CLIENT_SECRET, API_ACCESS_TOKEN
> # (hämta från lösenordshanterare eller dokumentation)
> ```
> 
> Återskapa sedan lokal override enligt mallen i steg 3.4 i [01-förutsättningar-och-installation.md](01-förutsättningar-och-installation.md). Skydda filen efteråt med `chmod 600 .env docker-compose.override.local.yaml`.

### Steg C: Återställ från daglig backup

```bash
cd ~/origo-admin

# Om MongoDB-volymen togs bort måste containern återskapas
origo-authentik up -d mongodb
origo-authentik ps mongodb

origo-authentik up -d server
origo-authentik ps server

# Lista tillgängliga backuper (senaste först)
ls -lt /opt/backups/mongodb/origo-backup-prod-[0-9]*.gz | head -5

# Återställ (ersätt tidsstämpel)
origo-authentik exec -T mongodb mongorestore --uri="mongodb://root:<MONGODB-LÖSENORD>@localhost/origoadmin?authSource=admin" --gzip --drop --archive < /opt/backups/mongodb/origo-backup-prod-<ÅÅÅÅMMDD_HHMM>.gz

# Återställ mediafiler (samma tidsstämpel)
origo-authentik exec -T server sh -c "rm -rf /data/uploads/* && tar xzf - -C /data/uploads" < /opt/backups/uploads/origo-backup-prod-uploads-<ÅÅÅÅMMDD_HHMM>.tar.gz

# Starta resterande tjänster
origo-authentik up -d
```

> **Obs:** Om `docker compose down -v` kördes har både MongoDB- och uploads-volymerna tagits bort. `MONGO_INITDB_ROOT_PASSWORD` i den lokala overriden sätter lösenordet vid nystart. Kontrollera att det matchar lösenordet i `DATABASE`-strängen och i backup-skriptet.

### Steg D: Docker-daemon fungerar inte

```bash
sudo systemctl status docker
sudo systemctl restart docker

docker ps

cd ~/origo-admin
origo-authentik up -d
origo-authentik ps
```

Om Docker inte går att starta, kontrollera diskutrymme och loggar:

```bash
df -h
sudo journalctl -u docker --since "1 hour ago"
```

### Snabbåterställning, checklista

- [ ] Identifierat vad som gått fel (Steg A–D)
- [ ] Repo-filer i känt tillstånd (`git checkout .`)
- [ ] Buggfixar i [02-källkodsfixar.md](02-källkodsfixar.md) återskapade efter `git checkout .`
- [ ] `.env` och lokal override korrekta
- [ ] Docker-tjänster uppe och healthy (`origo-authentik ps`)
- [ ] MongoDB återställd vid behov (Steg C)
- [ ] Klient nåbar: `curl http://localhost:3000`
- [ ] Inloggning fungerar
- [ ] Kartdata finns

> **Om inget ovan hjälper** och VM:en inte kan fås till fungerande tillstånd: kontakta Tyresö IT för återställning av VM från vCenter-backup (Fas 11).

## FAS 11: Katastrofåterställning (VM-krasch)

Om VM:en blir obrukbar kontaktas Tyresö IT för att återställa VM:en från deras VM-backup i vCenter.

> **Viktigt:** VM-backupen garanterar inte ett konsistent databasläge. Efter att VM:en är återställd ska MongoDB och mediafiler alltid återställas från den lokala applikationsbackupen. Data som skapats efter senaste applikationsbackup (kl 02:00) kan inte återställas.

### Steg 1: Kontakta Tyresö IT för återställning av VM

Meddela Tyresö IT att VM:en `origo-admin-prod` (eller `origo-admin-test`) behöver återställas från senaste VM-backup i vCenter. De hanterar hela processen.

När VM:en är tillbaka och nåbar via SSH, fortsätt med stegen nedan.

### Steg 2: Verifiera Docker-tjänster

```bash
cd ~/origo-admin

# Kontrollera att compose-filer och .env finns
ls -la docker-compose*.yaml .env

# Tjänster bör ha startat automatiskt (restart: always)
origo-authentik ps

# Om inte:
origo-authentik up -d

# Vänta tills servern är healthy
origo-authentik ps server
```

### Steg 3: Återställ från den lokala applikationsbackupen

Återställ alltid MongoDB och mediafiler från den lokala applikationsbackupen oavsett om VM-backupen verkar ha data.

```bash
# Lista tillgängliga backuper (senaste först)
ls -lt /opt/backups/mongodb/origo-backup-prod-[0-9]*.gz | head -5

# Återställ (ersätt tidsstämpel med den du vill använda)
origo-authentik exec -T mongodb mongorestore --uri="mongodb://root:<MONGODB-LÖSENORD>@localhost/origoadmin?authSource=admin" --gzip --drop --archive < /opt/backups/mongodb/origo-backup-prod-<ÅÅÅÅMMDD_HHMM>.gz

# Återställ mediafiler (samma tidsstämpel)
origo-authentik exec -T server sh -c "rm -rf /data/uploads/* && tar xzf - -C /data/uploads" < /opt/backups/uploads/origo-backup-prod-uploads-<ÅÅÅÅMMDD_HHMM>.tar.gz
```

> Återställ alltid MongoDB och mediafiler från samma tidpunkt. Data som lagts in efter senaste applikationsbackup (kl 02:00) kan inte återställas och får läggas in manuellt igen.

### Steg 4: Verifiera allt

```bash
origo-authentik ps

curl -s http://localhost:3010/api/swagger > /dev/null && echo "API OK" || echo "API nere"
curl -s http://localhost:3000 > /dev/null && echo "Klient OK" || echo "Klient nere"
```

Öppna webbläsare:

1. Admin-gränssnittet: `https://<PUBLIK-URL>/admin`
2. Logga in > Fungerar autentisering?
3. Kontrollera kartinstanser > Finns datan från senaste backupen?

### Steg 5: Verifiera backup-schemat

```bash
crontab -l | grep backup
cat /opt/backups/mongodb/backup.log
```

### Checklista katastrofåterställning

- [ ] Tyresö IT har återställt VM:en från VM-backup i vCenter
- [ ] VM:en har förväntad IP-adress och nätverk fungerar
- [ ] Alla Docker-tjänster uppe och healthy
- [ ] MongoDB och mediafiler återställda från lokal applikationsbackup
- [ ] IIS når VM:en (502-fel = nätverksproblem)
- [ ] Inloggning fungerar
- [ ] Kartinstanser och data finns
- [ ] Backup-schema verifierat
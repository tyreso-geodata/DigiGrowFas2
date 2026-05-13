#  Databasdesign - relationshandlingar

**Databas:** `relationshandlingar`  
**Schema:** `lageryta`  

## 1. Skapa databas

```sql
CREATE DATABASE relationshandlingar
    ENCODING 'UTF8';
```


## 2. Initiera databas

Kör detta efter att du anslutit till databasen `relationshandlingar`

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA lageryta;
```

## 3. Skapa användare

Skapas tidigt så att `ALTER DEFAULT PRIVILEGES` gäller framåt.

```sql
CREATE USER fme_user WITH PASSWORD 'byt_till_starkt_losenord';

GRANT CONNECT ON DATABASE relationshandlingar TO fme_user;
GRANT USAGE ON SCHEMA lageryta TO fme_user;

-- Rättigheter på befintliga objekt
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA lageryta TO fme_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA lageryta TO fme_user;

-- Automatiska rättigheter för framtida objekt (skapade av samma roll)
ALTER DEFAULT PRIVILEGES IN SCHEMA lageryta
    GRANT SELECT, INSERT, UPDATE ON TABLES TO fme_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA lageryta
    GRANT USAGE, SELECT ON SEQUENCES TO fme_user;
```

> **OBS:** `ALTER DEFAULT PRIVILEGES` gäller endast objekt skapade av samma roll som kör kommandot.

## 4. Tabell: `lageryta.projekt`

```sql
CREATE TABLE lageryta.projekt (
    id            SERIAL PRIMARY KEY,
    projektnummer VARCHAR(100)  NOT NULL UNIQUE,
    projektnamn   VARCHAR(255)  NOT NULL,
    rotmapp       VARCHAR(1000) NOT NULL UNIQUE
);
```

## 5. Tabell: `lageryta.filer`

```sql
CREATE TABLE lageryta.filer (
    id               SERIAL PRIMARY KEY,

    projekt_id       INTEGER       NOT NULL REFERENCES lageryta.projekt(id),
    lex_diarienummer VARCHAR(100),

    filnamn          VARCHAR(255)  NOT NULL,
    fil_sokvag       VARCHAR(1000) NOT NULL UNIQUE,
    filtyp           VARCHAR(10)   NOT NULL CHECK (filtyp IN ('dwg', 'ifc')),
    filstorlek       BIGINT        NOT NULL,
    skapad_datum     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    andrad_datum     TIMESTAMPTZ   NOT NULL DEFAULT now(),

    disciplin        VARCHAR(100)  NOT NULL,
    handlingstyp     VARCHAR(100)  NOT NULL,
    objekttyp        VARCHAR(100),

    upprattat_av     VARCHAR(255)  NOT NULL,

    taggar           TEXT[],
    sokbar           BOOLEAN       NOT NULL DEFAULT TRUE,

    projektomrade    GEOMETRY(Polygon, 4326)
);
```


## 6. Index

```sql
CREATE INDEX idx_filer_projekt       ON lageryta.filer(projekt_id);
CREATE INDEX idx_filer_filnamn       ON lageryta.filer(filnamn);
CREATE INDEX idx_filer_sokbar        ON lageryta.filer(sokbar);

CREATE INDEX idx_filer_taggar        ON lageryta.filer USING GIN(taggar);
CREATE INDEX idx_filer_projektomrade ON lageryta.filer USING GIST(projektomrade);
```

## 7. Trigger: uppdatera `andrad_datum`

```sql
CREATE OR REPLACE FUNCTION lageryta.filer_set_andrad_datum()
RETURNS TRIGGER AS $$
BEGIN
    NEW.andrad_datum = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER filer_set_andrad_datum
    BEFORE UPDATE ON lageryta.filer
    FOR EACH ROW
    EXECUTE FUNCTION lageryta.filer_set_andrad_datum();
```

## 8. Tabell: `lageryta.fil_fastighet`

```sql
CREATE TABLE lageryta.fil_fastighet (
    id                   SERIAL PRIMARY KEY,
    fil_id               INTEGER      NOT NULL REFERENCES lageryta.filer(id) ON DELETE CASCADE,
    fastighetsbeteckning VARCHAR(255) NOT NULL
);

CREATE INDEX idx_fastighet_fil ON lageryta.fil_fastighet(fil_id);
```

## 9. Sökning på taggar

```sql
-- Filer med taggen "vvs"
SELECT * FROM lageryta.filer
WHERE 'vvs' = ANY(taggar);

-- Filer med alla angivna taggar (AND)
SELECT * FROM lageryta.filer
WHERE taggar @> ARRAY['vvs', 'källare'];

-- Filer med någon av taggarna (OR)
SELECT * FROM lageryta.filer
WHERE taggar && ARRAY['vvs', 'källare'];
```

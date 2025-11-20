# Projektöversikt DigigrowFas2

Detta repo innehåller konfigurationer, installationer och byggfiler för vår Origo-baserade kartklient, inklusive:

* **GeoServer (Tomcat + IIS-proxy)**
* **QGIS Server (IIS FastCGI)**
* **Origo-klient (statisk build + plugins)**
* **Miljöspecifika TEST och PROD-konfigurationer**

# Versionsinformation

Nedan listas versioner för verktyg och komponenter som används i projektet.

**Origo**  
– Version: (fyll i)

**GeoServer**: 2.28.0  
**QGIS Server**: (fyll i)
**Tomcat**: (fyll i)
**Node.js**: (fyll i)
**PostgreSQL / PostGIS**  
– PostgreSQL-version: (fyll i)  
– PostGIS-version: (fyll i)


# Mappstruktur

| Mapp         | Beskrivning                                             |
|--------------|---------------------------------------------------------|
| `/origo/`    | Statisk kopia av Origo v2.9.0                           |
| `/plugins/`  | Plugins                                                 |
| `/docs/`     | Arkitektur och övergripande dokument                    |
| `/TEST/`     | Testmiljö (GeoServer, QGIS Server, IIS, Origo-build, Postgres) |
| `/PROD/`     | Produktionsmiljö                                        |
| `/Postgres/` | PostgreSQL & Postgis                                    |


# Installationer (TEST-miljö)

Här är direkta länkar till installationsguider i TEST-miljön.

### **Postgres**  
[Öppna Postgres-installationsguide](./Postgres/README.md)

### **GeoServer (Tomcat + GeoServer + IIS-proxy)**  
[Öppna GeoServer-installationsguide](./PROD/Geoserver/README.md)

### **QGIS Server (FastCGI under IIS)**  
[Öppna QGIS Server-installationsguide](./PROD/QGIS_Server/README.md)


# Arkitektur

Övergripande systemarkitektur i:

![systemarkitektur](image.png)

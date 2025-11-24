##  Förberedelser

Säkerställ att din servermiljö har IIS samt CGI installerat. Du kan installera CGI genom Server Managers GUI under Web Server (IIS)/Web Server/Application Development eller genom att köra nedanstående skript i PowerShell:
```powershell
Install-WindowsFeature Web-Server, Web-CGI, Web-Mgmt-Console
```

Ladda ner och kör OSGeo4W (`Advanced Install`), välj följande paket under Select Packages:

- Desktop / qgis
-  Web / qgis-ltr-server

### Kontroll av OSGeo4W installation samt binärfil

Öppna kommandotolken (cmd) som administratör och kör nedanstående kommando.

```cmd
C:\OSGeo4W\apps\qgis-qt6\bin\qgis_mapserv.fcgi.exe –help
```

Om du ser felmeddelanden (t.ex. att *libfcgi.dll*, *Qt6Core.dll* saknas) ställ in en temporär PATH genom att köra kommandot (anpassa till din sökväg/installation).
```cmd
set PATH=C:\OSGeo4W\bin;C:\OSGeo4W\apps\qgis-qt6\bin;C:\OSGeo4W\apps\Qt6\bin;C:\OSGeo4W\apps\Python312;%PATH%
```

Kör det första kommandot igen, nu bör du se information om att din QGIS Server fungerar som den ska.


### Skapa en FastCGI applikation i IIS

Öppna IIS Manager och klicka på din server i vänsterspalten. Dubbelklicka därefter på FastCGI Settings i mittenpanelen, klicka sedan på Add Application i högerspalten. Om du inte ser FastCGI Settings behöver du installera CGI på nytt via Windows Server Manager GUI. Ange nedanstående information, anpassa efter din egen installation.

1.     **Full Path:** `C:\OSGeo4W\apps\qgis-qt6\bin\qgis_mapserv.fcgi.exe`
2.     **Arguments:** Lämna tomt
3.     **Max Instances**: 4
4.     **Instance Max Requests:** 10000
5.     **Activity Timeout:** 300s
6.     **Environment Variables** (Klicka på de tre punkterna …):

o   **PATH**=`C:\OSGeo4W\bin;C:\OSGeo4W\apps\qgis-qt6\bin;C:\OSGeo4W\apps\Qt6\bin;C:\OSGeo4W\apps\Python312`

o   **QGIS_PREFIX_PATH**=`C:\OSGeo4W\apps\qgis-qt6`

o   **QT_PLUGIN_PATH**=`C:\OSGeo4W\apps\Qt6\plugins;C:\OSGeo4W\apps\qgis-qt6\qtplugins`

o   **GDAL_DATA**=`C:\OSGeo4W\share\gdal
`
o   **PROJ_LIB**=`C:\OSGeo4W\share\proj`

o   **PYTHONHOME**=`C:\OSGeo4W\apps\Python312`

o   **PYTHONPATH**=`C:\OSGeo4W\apps\qgis-qt6\python`

Du kan även lägga till nedanstående variabler om du vill skapa logfiler:

-  **QGIS_SERVER_LOG_FILE**=Valfri plats/logfil

-  **QGIS_SERVER_LOG_LEVEL**=`0` eller `2` (0: debug, 2: prod, 3: bara errors)

Starta om IIS genom att köra kommandot `iisreset` i **cmd** med **administratörsrättigheter**.


### Skapa en ny applikationspool

1.	Öppna IIS och klicka på Application Pool i vänsterspalten. 
2.	Klicka därefter på Add Application Pool… i högerspalten. 
3.	Namn: (förslagsvis QGISPool) och No Managed Code under .NET CLR version. 
4.	Pileline: Integrated
5.	Idle Time-out: 0
6.	Recycling: 02:00
7.	Välj Start application pool immediately och klicka därefter på OK.
8.	Starta om IIS genom att köra kommandot `iisreset` i **cmd** med **administratörsrättigheter**.


### Skapa en applikation under din site

1.	Högerklicka på din site i IIS och välj Add Application. 
2.	Välj namn (denna manual kommer att förusätta att namnet är qgis).
3.	Välj din nyskapade applikationspool under Application Pool
4.	Ställ in physical path (skapa en ny map under `C:\inetpub\DIN_SITE\qgis`)
5.	Starta om IIS genom att köra kommandot `iisreset` i **cmd** med **administratörsrättigheter**.

### Ställ in Handler Mapping för din applikation

Klicka på den applikation du precis skapat (qgis) under din site, klicka därefter på Handler Mappings i mittenpanelen. Klicka därefter på:

1.	Add Manager Handler…
2.	Request path: `qgis_mapserv.fcgi`
3.	Module: `FastCgiModule`
4.	Executable: `C:\OSGeo4W\apps\qgis-qt6\bin\qgis_mapserv.fcgi.exe`
5.	Name: **QGIS_FastCGI**
6.	Klicka på Request Restrictions… och checka ur Invoke handler only if request is mapped to…
7.	Starta om IIS genom att köra kommandot `iisreset` i **cmd** med **administratörsrättigheter**.

### Ställ in läsbehörighet för applikationspoolen

Säkerställ att den applikationspool du skapat har behörighet att Read & execute för följande mappar:

•	`C:\OSGeo4W\ `
•	Din data/projektmapp (t.ex. `E:\qgisserver\projekt`)

Lägg till behörighet genom att:

1.	Högerklicka på mappen och välj Egenskaper
2.	Gå till fliken Security
3.	Klicka på Edit
4.	Klicka på Add
5.	Under Locations… välj din server.
6.	Under Enter the object names to select, skriv IIS AppPool\QGISPool och klicka därefter på Check Names.
7.	Klicka på OK.


### Tester

Testa att nå din site genom länken nedan:

https://din.webadress.se/qgis/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities

Om allt fungerar som det ska, men inget project är definierat, bör du se något i stil med strängen nedan. I så fall fungerar IIS, FastCGI, samt QGIS Server som det ska.

<ServerException>... please provide a SERVICE and a MAP parameter ...</ServerException>
8.1 Peka på ett projekt
1.	Skapa ett QGIS projekt och lägg den i din projektmapp (samma mapp som applikationspoolen har tillgång till).
2.	Använd nu adressen https://din.webadress.se/qgis/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities&MAP=E:\qgisserver\projekt\mittprojekt.qgz
3.	Du skall nu kunna se en fungerande XML-kod


### Rena URL:er med Rewrite rules i IIS

```xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Rena QGIS-server URL:er" stopProcessing="true">
          <match url="^([^/]+)$" />
          <action type="Rewrite"
                  url="/qgis/qgis_mapserv.fcgi?MAP=E:\qgisserver\projekt\{R:1}.qgz"
                  appendQueryString="true" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```
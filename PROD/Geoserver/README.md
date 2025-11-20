## Förberedelser

### Installera Java (JDK 17+)

1. **Installera JDK 17**. Du kan använda en MSI-installer från t.ex. Adoptium:
   [https://adoptium.net/temurin/releases](https://adoptium.net/temurin/releases)
2. Markera valet **“Set JAVA_HOME”** under installationen.
3. Verifiera installationen genom att köra följande kommando i *cmd*:

   ```cmd
   java -version
   ```
4. Kontrollera att `JAVA_HOME` är korrekt satt:

   ```cmd
   echo %JAVA_HOME%
   ```
5. Kontrollera att sökvägen **inte** slutar med ett snedstreck (`/`) eller backslash (`\`).
   Om den gör det, ta bort det genom att gå till:
   **Kontrollpanelen/System/Avancerade systeminställningar/Miljövariabler**.


### Installera Tomcat som en Windowstjänst

1. Ladda ner **Windows Service Installer** för Tomcat 9 (det skall vara en .exe-fil, inte en .zip).
2. Kör den nedladdade filen och välj **Full** installation.
3. Peka Java mot den mapp du installerade JDK i.
4. Ange tjänstnamn, förslagsvis `Tomcat9`
5. **Initial ports**: välj **HTTP = 8080**.
6. Klicka på **Finish**. Tomcat kommer nu köras som en Windowstjänst, bekräfta genom att gå till Windows Services.
7. Testa även att nå Tomcat via länken:
```
http://localhost:8080/
```


### Lägg till GeoServer (WAR) I Tomcat

1. Ladda ner **GeoServer WAR** (Web Archive) från https://geoserver.org/release/stable/
2. Kopiera geoserver.war till mappen webbapps i din installationsmapp för Tomcat (`C:\Program Files\Apache Software Foundation\Tomcat 9.0\webapps`\)
3. Vänta en stund, Tomcat kommer att bygga upp GeoServer.
4. Testa att nå geoserver via länken:
```
http://localhost:8080/geoserver
```


### Skapa en ny datakatalog för GeoServer

1. Skapa en ny datakatalog för GeoServer, förslagsvis på en annan nätverkskatalog än C: (t.ex. E:/geoserver_data)

2.     Flytta `C:\Program Files\Apache Software Foundation\Tomcat 9.0\webapps\geoserver\data till E:\geoserver_data`

3.     Lägg till miljövariabeln `GEOSERVER_DATA_DIR` = `E:\geoserver_data\data` genom att gå till **Kontrollpanelen/System/Avancerade systeminställningar/Miljövariabler**…

4. Ge Tomcat behörighet till den nyskapade datakatalogen (vanligtvis körs Windowstjänster med ”användaren” Local System) genom att köra nedanstående kommando i kommandotolken med administratörsbehörigheter:

```powershell
icacls "E:\geoserver_data" /grant "LOCAL SERVICE:(OI)(CI)F" /T
```

(Om Tomcat körs som en annan användare än Local System behöver du istället ge det kontot behörighet.)

5. Starta om din Tomcat-tjänst i Windows Services.


### IIS samt installation av nödvändiga moduler

1. PowerShell med adminstratörsrättigheter:  
    _Install-WindowsFeature Web-Server, Web-Mgmt-Tools, Web-Common-Http, Web-Default-Doc, Web-Static-Content._

2.     Kontakta din IT-avdelning för att få ta del av ett certifikat (CA) för din DNS-adress och be dem installera den på din server. Du skall därefter kunna se certifikatet under Server Certificates efter du klickat på din server i IIS.

3. Installera **URL Rewrite** samt **Application Request Routing (ARR)** genom att ladda ner dem från respektive nedladdningssida.
4. Kör respektive installationsfil, starta om IIS med kommandot iisreset i cmd med administratörsrättigheter.
5. Gå till IIS, klicka på din server och därefter på **Application Request Routing Cache**. Klicka på **Server Proxy Settings…** och välj sedan **Enable Proxy**.
6. Klicka på **Sites**, klicka därefter på **Default Web Site** och sedan på **Stop**
7. Högerklicka därefter på **Sites** och välj sedan **Add Website…**
8. Ange:  
    **Site name**: Namnet på sidan (detta blir även namnet på din AppPool).  
    **Physical path**: (förslagsvis en ny map på C:/inetpub)  
    **Type**: https (kräver att du har ett CA)  
    **Ip address:** All Unassigned  
    **Port:** 433  
    **Host name**: Din webbadress (kräver att din IT-avdelning har skapt ett nytt DNS-namn).  
    **SSL certificate**: Det certifikat du tidigare beställt.
9. Klicka på **OK**, din sida skapas.


### URL Rewrite - finare webbadresser

För att din sida ska veta vilka portar olika adresser ska kika på behöver vi skapa omskrivningsregler.

1. I IIS, gå till din sida och klicka sedan på **URL Rewrite**.
2. Klicka på **Add Rule(s)** och sedan på **Blank rule.**
3. Lämna **Requested URL** och **Using** orörda.
4. I pattern, skriv ^geoserver(.*)
5. Under **Server Variables** ange:

o   HTTP_X_FORWARDED_PROTO = https

o   HTTP_X_FORWARDED_HOST = {HTTP_HOST}

o   HTTP_X_FORWARDED_FOR = {REMOTE_ADDR}

![](file:///C:/Users/sepcaa/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png)

6. Under **Action** välj **:**

- Action type: **Rewrite**
- Rewrite URL: 
```
http://localhost:8080/geoserver{R:1}
```

- Checka i **Append query string**

### Ställ in Proxy Base URL

För att kunna nyttja din domänadress behöver vi göra några justeringar i GeoServers **Global Settings.** Eftersom vi nu pekar på https kommer du inte kunna göra dessa inställningar genom att använda ditt vanliga domännamn, istället behöver du nå GeoServer via följande adress localhost:8080/geoserver.

Gå därefter till Global Settings och skriv i din riktiga webbadress under Proxy Base URL, säkerställ även att **Use headers for Proxy URL** är checkad.

![](file:///C:/Users/sepcaa/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png)


### Aktivera CORS

 
- Navigera till `web.xml` (finns i Tomcats installationsmapp):
`C:\Program Files\Apache Software Foundation\Tomcat <version>\webapps\geoserver\WEB-INF\web.xml`

- Öppna filen i t.ex. Notepad++ och avkommentera nedanstående kod:
```xml
    <filter>
       <filter-name>cross-origin</filter-name>
       <filter-class>org.apache.catalina.filters.CorsFilter</filter-class>
       <init-param>
         <param-name>cors.allowed.origins</param-name>
         <param-value>*</param-value>
       </init-param>
       <init-param>
         <param-name>cors.allowed.methods</param-name>
         <param-value>GET,POST,PUT,DELETE,HEAD,OPTIONS</param-value>
       </init-param>
       <init-param>
         <param-name>cors.allowed.headers</param-name>
         <param-value>*</param-value>
       </init-param>
    </filter>

<filter-mapping>
    <filter-name>cross-origin</filter-name>
    <url-pattern>/*</url-pattern>
</filter-mapping>
```

- I samma dokument, lägg till din URL/DNS under CRSF_WHITELIST.

```xml
    <context-param>
        <param-name>GEOSERVER_CSRF_WHITELIST</param-name>
        <param-value>din.url.se</param-value>
    </context-param>
```
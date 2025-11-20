# Installation av PostgreSQL och PostGIS

Börja din installation av PostgreSQL, och därav PostGIS, genom att:

1.	Ladda ner PostgresSQL för Windows (https://www.postgresql.org/download/windows/)
2.	Hämta ETB installer som innehåller PostgreSQL, pgAdmin och StackBuilder.
3.	Kör installationsfilen och fortsätt med defaultinställningar, t.ex. port 5432. 
4.	Välj ett starkt lösenord för superanvändaren postgres.
5.	Välj placering av din data-katalog, det behöver inte vara samma nätverksplats eller nätenhet som PostgreSQL installeras på. 
6.	När installationen är klar öppnas StackBuilder, fortsätt genom installationen och välj PostGIS-paketet under spatial extensions.

## Verifikation av installation
Säkerställ att installationen gått bra genom att:

1.	Öppna pgAdmin
2.	Anslut till din server genom att klicka på Servers → Register. 
3.	Under fliken Connection ange:
•	Host name: localhost
•	Username: postgres
•	Password: (det lösenord du angav vid installation)

4.	Skapa en ny databas genom att högerklicka på Databases/Create/Database…
5.	Öppna din nyskapade databas, högerklicka på Extensions/Create/Extension…
6.	Under Name sök efter postgis, klicka på postgis och därefter på Save.  

Säkerställ att en tjänst skapats under Windows Service
När PostgreSQL installeras genom ETB-installer skall en tjänst skapas under Windows Service, säkerställ dock att detta skapats genom att:

1.	Klicka på Win + R, skriv in services.msc och klicka därefter på Enter.
2.	Leta efter en tjänst som heter något likt postgresql-x64-XX (t.ex. postgresql-x64-18). 
3.	Säkerställ att:
•	Startup type: Automatic
•	Status: Running
4.	Här kan du stoppa och starta om din tjänst/databas. 

## Justera Windows Firewall
För att tillåta anslutningar mot databasen behöver vi öppna port 5432. Detta gör vi genom att:

1.	Öppna Windows Defender Firewall → Advanced Settings → Inbound Rules.
2.	Klicka på New Rule → Port.
3.	Välj följande inställningar:
•	TCP
•	Specific local ports: 5432.

## Tillåt andra klienter att ansluta mot databasen
För att tillåta andra klienter att ansluta mot databasen behöver du redigera särskilda config-filer, börja dock med att ta reda på serverns lokala IP-adress.

1.	Öppna CMD och skriv ipconfig.
2.	Notera din IPv4 Adress, t.ex. 192.168.1.25.
3.	Denna adress kommer senare användas för att ansluta mot databasen i t.ex. QGIS.
4.	Navigera till din datakatalog och öppna filen postgresql.conf.
5.	Säkerställ att `listen_addresses = '*'`, spara och stäng filen.
6.	Öppna filen `pg_hba.conf` och lägg till en rad i slutet av dokumentet med följande information (gör dock även nedanstående ändringar: 

host    all             all             172.18.0.0/16 	scram-sha-256

•	Ersätt `172.18.0.0/16` med ditt nätverks subnät.
•	/16 betyder "vilken IP-adress som helst från `172.18.0.0` till 172.18.255.255.
•	**scram-sha-256** är autentiseringsmetoden som används för att verifiera användarens lösenord på ett säkert sätt. 

7.	Lägg till ytterligare adresser vid behov.
8.	Spara och stäng dokumentet.
9.	Starta om din Windows tjänst genom att:
	•	Klicka på Win + R
	•	Skriv in services.msc
	•	Klicka på Starta om tjänsten.
10.	Du ska nu kunna ansluta dig mot databasen i t.ex. QGIS genom att ange serverns IP-adress som host name. 

## Aktivera SSL för att möjliggöra för krypterad anslutning
Fyll på med text här…

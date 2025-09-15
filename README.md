# KIX18 Log Converter
![Version](https://img.shields.io/badge/version-1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)


Ein Tool um die HTTP-Request-Logs von **KIX 18** in ein übersichtlicheres Format zu konvertieren (CSV oder JSON).
Nützlich für die Auswertungen, Debugging oder Monitoring - Um die Daten in Grafana zu visualisieren.

## Features
- Liest KIX 18 HTTP-Request-Logs ein
- Konvertiert in wählbare Formate (CSV, JSON)
- Zeit Umwandlung in ISO
- Ermöglicht einfache Integration in Grafana
- Tabellennamen können direkt angepasst werden.
- Vorgeschlagener Header: **Time, Log-Level, pid, backendPID, service, duration, backendTimeTillExecution, backendDurationTotal, requestMethod, httpStatus, requestSize, ressource, parameters**
  Der Header kann natürlcih auch angepasst werden wenn man einen alternativen Header möchte (unter puplic app.js Zeile 221 ff.)

## Installation
```bash
git clone https://github.com/cedric-2002/kix18-log-converter.git
cd kix18-log-converter
npm install

```
## Screenshots<img width="1484" height="916" alt="Bildschirmfoto vom 2025-09-15 11-56-49" src="https://github.com/user-attachments/assets/a8d31ba5-5165-422c-95a1-cbf2a27f4a79" />


## Erklärung der Felder und Optionen

Datei 
- Auswahl der Log Datei, die konvertiert oder angezeigt werden soll

Delimitir
- Gibt an welches Zeichen die Spalten trennt ( Automatisch, Tab, Komma, Semikolon, Pipe, Mehrfachleerzeichen)

Vorschauzeilen
- Anzahl der Zeilen, die als Vorschau angezeigt werden

Spaltenanzahl
- Erwartete Anzahl an Spalten in der Datei, um bei Fehlern die richtige Spaltenanzahl festzulegen

Export Dateiname
- Name der Ausgabedatei (z.B. http-request)

CSV-Trennzeichen
- Definiert das Trennzeichen für den CSV export (Komma oder Semikolon)

Zeitspalte für ISO
- Wähle die Spalte, die den Zeitstempel enthält um sie ins ISO Format zu konvertieren

ISO-Zeitmodus 
- Legt fest ib Zeitstempel als UTC (Z), mit Offset oder ohne Gespeichert werden soll

Zeitzonen-Offset
- Manueller Offset (z.B. +02:00) für lokale Zeitzonen wenn ISO Zeiten umgerechnet werden

Header vorschlagen
- legt die Spaltennamen automatisch Fest (Time, Log-Level, pid, backendPID, service, duration, backendTimeTillExecution, backendDurationTotal, requestMethod, httpStatus, requestSize, ressource, parameters)
- Anpassbar unter puplic app.js Zeile 221 ff
- der Header kann natürlich auch in der Vorschau angepasst werden

Vorschau aktualisieren
- Aktualisiert die Datenvorschau nach Änderungen an Einstellungen

Als CSV exportieren 
- Exportiert die aktuell angezeigte Tabelle in eine CSV Datei

Als JSON exportiern
- Exportiert die aktuell angezeigte Tabelle in eine JSOn Datei

CSV speichern
- Speichert die Datei direkt als CSV auf dem Rechner um sie im Netzwerk abzurufen. (praktisch für Grafana, um nicht jedes mal die Datei neu hochzuladen. WICHTIG: DATEINAME MUSS DANN IMMER GLEICH SEIN

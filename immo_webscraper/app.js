// app.js - Master-Zentrale für das Big-Data-Projekt
//   node app.js          Scheduler: Grund-Scrape (falls noch keine Daten), danach
//                        - alle 10 Minuten die erste Seite jeder Quelle  ("fast")
//                        - einmal täglich im Zeitfenster 03:00-06:00 alle Seiten  ("full")
//   node app.js full     einmaliger vollständiger Lauf
//   node app.js fast     einmaliger schneller Lauf (nur erste Seite)
// Jeder Lauf schreibt pro Quelle eine eigene Datei nach data/raw/runs/.
// Ein vollständiger Lauf aktualisiert zusätzlich den Gesamtstand data/raw/<quelle>_listings.jsonl.
const fs = require('fs');
const path = require('path');
const { scrapeWillhaben } = require('./test/willhaben_test');
const { scrapeImmoScout } = require('./test/immoscout24_test');
const { scrapeStandard } = require('./test/standard_test');

//Konfiguration der Scraper-Läufe
const CONFIG = {
    fastIntervalMin: 10,                    // Abstand der schnellen Läufe in Minuten
    fastPages: 1,                           // schneller Lauf: nur die erste Seite (neueste Inserate)
    fullMaxPages: 150,                      // Obergrenze beim vollen Lauf; Scraper stoppen früher, wenn nichts Neues kommt
    fullWindow: { startHour: 3, endHour: 6 }, // Zeitfenster für den täglichen vollen Lauf (Uhrzeit)
    fullReserveMin: 120                      // so viel Laufzeit vor Fensterende einplanen in Minuten
};

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const RUNS_DIR = path.join(RAW_DIR, 'runs');

const SOURCES = [
    { name: 'willhaben',   scrape: scrapeWillhaben, snapshot: 'willhaben_listings.jsonl' },
    { name: 'immoscout24', scrape: scrapeImmoScout, snapshot: 'immobilienscout_listings.jsonl' },
    { name: 'derstandard', scrape: scrapeStandard,  snapshot: 'standard_listings.jsonl' }
];

//Hilfsfunktionen um die aktuelle Zeit in österreichischer Zeitzone zu bekommen
const TZ = 'Europe/Vienna';
const now = () => new Date().toLocaleString('de-AT', { timeZone: TZ });
 
// Zeitstempel für Dateinamen in österreichischer Zeit, z.B. 2026-11-09T03-12-45
const stamp = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}`;
};

// Einzelner Scraper-Lauf
async function runJob(runType) {
    const maxPages = runType === 'fast' ? CONFIG.fastPages : CONFIG.fullMaxPages;
    const ts = stamp();
    fs.mkdirSync(RUNS_DIR, { recursive: true });
 
    console.log("\n========================================");
    console.log(`[${now()}] ▶ ${runType.toUpperCase()}-Lauf startet (max. ${maxPages} Seite(n) pro Quelle)`);
    console.log("========================================");
 
    for (const src of SOURCES) {
        const outputPath = path.join(RUNS_DIR, `${src.name}_${runType}_${ts}.jsonl`);
        try {
            const count = await src.scrape({ maxPages, outputPath, runType });
 
            // Voller Lauf: Gesamtstand ersetzen, aber nur, wenn wirklich etwas geliefert wurde
            if (runType === 'full' && count > 0) {
                fs.copyFileSync(outputPath, path.join(RAW_DIR, src.snapshot));
            } else if (runType === 'full') {
                console.log(`${src.name}: 0 Inserate – Gesamtstand bleibt unverändert`);
            }
        } catch (err) {
            // Ein Fehler bei einer Quelle stoppt die anderen nicht
            console.error(`${src.name}: ${err.message}`);
        }
    }
    console.log(`[${now()}] ✔ ${runType.toUpperCase()}-Lauf beendet`);
}

// Läufe nacheinander ausführen, nie gleichzeitig
let queue = Promise.resolve();
let busy = false;
function enqueue(runType) {
    queue = queue
        .then(async () => { busy = true; try { await runJob(runType); } finally { busy = false; } })
        .catch(err => console.error('Lauf fehlgeschlagen:', err));
    return queue;
}

// Zeitplanung
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
 
// Zufällige Startzeit im Zeitfenster des angegebenen Tages (so, dass der Lauf noch im Fenster endet)
function randomTimeOn(day) {
    const { startHour, endHour } = CONFIG.fullWindow;
    const spanMin = Math.max((endHour - startHour) * 60 - CONFIG.fullReserveMin, 0);
    const start = new Date(day);
    start.setHours(startHour, 0, 0, 0);
    return new Date(start.getTime() + Math.random() * spanMin * 60000);
}
 
function scheduleFull(day = new Date()) {
    let at = randomTimeOn(day);
    if (at <= new Date()) {                 // heutiges Fenster schon vorbei -> morgen
        day = addDays(day, 1);
        at = randomTimeOn(day);
    }
    console.log(`Nächster vollständiger Lauf: ${at.toLocaleString('de-AT')}`);
    setTimeout(async () => {
        await enqueue('full');
        scheduleFull(addDays(day, 1));      // nächster Lauf frühestens am Folgetag
    }, at - Date.now());
}
 
async function startScheduler() {
    console.log(`⏱️  Scheduler gestartet: alle ${CONFIG.fastIntervalMin} Min. schneller Lauf, `
        + `täglich ${CONFIG.fullWindow.startHour}:00-${CONFIG.fullWindow.endHour}:00 voller Lauf`);
 
    // Noch kein Gesamtstand vorhanden -> zuerst Grund-Scrape
    const missing = SOURCES.filter(s => !fs.existsSync(path.join(RAW_DIR, s.snapshot)));
    if (missing.length > 0) {
        console.log(`Kein Gesamtstand für ${missing.map(s => s.name).join(', ')} – starte Grund-Scrape`);
        await enqueue('full');
    } else {
        await enqueue('fast');
    }
 
    setInterval(() => {
        if (busy) console.log(`[${now()}] Schneller Lauf übersprungen (letzter Lauf läuft noch)`);
        else enqueue('fast');
    }, CONFIG.fastIntervalMin * 60 * 1000);
 
    scheduleFull();
}

// Start
if (require.main === module) {
    process.on('unhandledRejection', err => console.error('Unbehandelter Fehler:', err));
 
    const mode = process.argv[2] || 'schedule';
    if (mode === 'full' || mode === 'fast') {
        enqueue(mode).then(() => process.exit(0));
    } else if (mode === 'schedule') {
        startScheduler();
    } else {
        console.log('Verwendung: node app.js [schedule | full | fast]');
        process.exit(1);
    }
}
 
module.exports = { CONFIG, runJob, randomTimeOn, enqueue };
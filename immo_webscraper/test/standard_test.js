const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://immobilien.derstandard.at/suche/wien/mieten-wohnung';
const ORIGIN = 'https://immobilien.derstandard.at';

function decodeEntities(str) {
    return str
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html) {
    return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// "1.010,68" -> 1010.68, "3.100" -> 3100, "64,63" -> 64.63
function toNumber(str) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

// Extrahiert die Inserate aus dem HTML einer Suchergebnisseite.
// Jede Inserat-Karte verlinkt auf /detail/<id>; der Text zwischen zwei Karten wird ausgewertet.
function parseListings(html) {
    const linkRegex = /href="(?:https:\/\/immobilien\.derstandard\.at)?\/(detail|gruppe)\/(\d+)[^"]*"/g;

    // erste Fundstelle jeder ID = Beginn der Karte
    const starts = [];
    const seen = new Set();
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
        const key = `${m[1]}/${m[2]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        starts.push({ type: m[1], id: m[2], index: m.index });
    }

    const listings = [];
    for (let i = 0; i < starts.length; i++) {
        const { type, id, index } = starts[i];
        if (type !== 'detail') continue; // Neubauprojekt-Gruppen überspringen

        // Karten sind lang (Bildergalerie, SVGs), daher großzügiges Limit 
        const end = i + 1 < starts.length ? starts[i + 1].index : index + 40000;
        let chunk = html.substring(index, Math.min(end, index + 40000));

        // Titel steht in der <h2>; danach aus dem Text entfernen, damit er die Regex nicht stört
        const h2 = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        if (!h2) continue; // Mini-Links innerhalb von Projekt-Karten haben keinen Titel
        const title = htmlToText(h2[1]);
        chunk = chunk.replace(h2[0], ' ');

        const text = htmlToText(chunk);
        const location = text.match(/(\d{4}\s*Wien[^€]*?)\s*(?:ab\s*)?€/);
        const price = text.match(/€\s*([\d.]+(?:,\d+)?)/);
        const area = text.match(/([\d.]+(?:,\d+)?)\s*m²/);
        const rooms = text.match(/(\d+)\s*Zimmer/);

        listings.push({
            id: +id,
            url: `${ORIGIN}/detail/${id}`,
            title,
            location: location ? location[1].replace(/\s+,/g, ',').replace(/,(?=\S)/g, ', ').trim() : null,
            plz: location ? +location[1].match(/\d{4}/)[0] : null,
            price: price ? toNumber(price[1]) : null,
            area_m2: area ? toNumber(area[1]) : null,
            rooms: rooms ? +rooms[1] : null,
            source: 'derstandard'
        });
    }
    return listings;
}

async function getListings(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept-Language': 'de-AT,de;q=0.9'
        }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseListings(await response.text());
}

async function scrapeStandard() {
    const outputPath = path.join(__dirname, '../../data/standard_listings.jsonl');

    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const maxPages = 2;

    let allListings = [];
    const seenIds = new Set();
    let page = 1;
    let hasMorePages = true;

    fs.writeFileSync(outputPath, '');
    console.log("🚀 Starte DerStandard Scraping...");

    while (hasMorePages && page <= maxPages) {
        let success = false;
        let retries = 0;
        let listings = [];

        while (!success && retries < 3) {
            try {
                listings = await getListings(page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`);
                success = true;
            } catch (error) {
                retries++;
                console.log(`⚠️ DerStandard Fehler auf Seite ${page} (Versuch ${retries}/3): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        // Duplikate ausfiltern (z.B. wenn der page-Parameter ignoriert wird)
        const fresh = listings.filter(item => !seenIds.has(item.id));
        fresh.forEach(item => seenIds.add(item.id));

        if (!success || fresh.length === 0) {
            hasMorePages = false;
            break;
        }

        allListings.push(...fresh);
        fs.appendFileSync(outputPath, fresh.map(item => JSON.stringify(item)).join('\n') + '\n');

        console.log(`-> DerStandard Seite ${page}: ${fresh.length} Anzeigen (Gesamt: ${allListings.length})`);
        page++;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`✅ DerStandard fertig: ${allListings.length} Wohnungen gespeichert.\n`);
    return allListings.length;
}

module.exports = { scrapeStandard, getListings, parseListings };
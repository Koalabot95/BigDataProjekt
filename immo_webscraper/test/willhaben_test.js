const fs = require('fs');
const path = require('path');

const NEXT_DATA_TAG = '<script id="__NEXT_DATA__" type="application/json">';

// Holt die Inserate einer Willhaben-Suchseite aus dem eingebetteten __NEXT_DATA__-JSON
async function getListings(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const start = html.indexOf(NEXT_DATA_TAG);
    if (start === -1) throw new Error('__NEXT_DATA__ nicht gefunden (Seitenstruktur geändert oder blockiert?)');

    const rest = html.substring(start + NEXT_DATA_TAG.length);
    const result = JSON.parse(rest.substring(0, rest.indexOf('</script>')));
    const adverts = result.props.pageProps.searchResult?.advertSummaryList?.advertSummary || [];

    return adverts.map(advert => {
        // Attribute-Array (name/values) in flache Felder umwandeln, z.B. PRICE -> price
        (advert.attributes?.attribute || []).forEach(element => {
            const value = element.values[0];
            advert[element.name.toLowerCase()] = isNaN(value) ? value : +value;
        });

        // unnötige Felder entfernen
        delete advert.attributes;
        delete advert.contextLinkList;
        delete advert.advertiserInfo;
        delete advert.advertImageList;

        return advert;
    });
}

// Optionen: maxPages (Anzahl Seiten), outputPath (Zieldatei), runType ('full' | 'fast', wird als Metadatum gespeichert)
async function scrapeWillhaben({
    maxPages = 2,
    outputPath = path.join(__dirname, '../../data/raw/willhaben_listings.jsonl'),
    runType = 'full'
} = {}) {
 
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
 
    // Mietwohnungen Wien (areaId=900) – bei Bedarf anpassen
    const baseUrl = 'https://www.willhaben.at/iad/immobilien/mietwohnungen/mietwohnung-angebote?areaId=900';
    const pageSize = 25;
 
    let allListings = [];
    const seenIds = new Set();
    const scrapedAt = new Date().toISOString();
    let page = 1;
    let hasMorePages = true;
 
    fs.writeFileSync(outputPath, '');
    console.log("Starte Willhaben Scraping...");
 
    while (hasMorePages && page <= maxPages) {
        let success = false;
        let retries = 0;
        let listings = [];
 
        while (!success && retries < 3) {
            try {
                listings = await getListings(`${baseUrl}&rows=${pageSize}&page=${page}`);
                success = true;
            } catch (error) {
                retries++;
                console.log(`Willhaben Fehler auf Seite ${page} (Versuch ${retries}/3): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
 
        // Duplikate ausfiltern; liefert eine Seite nichts Neues mehr, ist das Ende erreicht
        const fresh = listings.filter(item => !seenIds.has(item.id));
        fresh.forEach(item => seenIds.add(item.id));
 
        if (!success || fresh.length === 0) {
            hasMorePages = false;
            break;
        }
 
        allListings.push(...fresh);
        fs.appendFileSync(outputPath, fresh.map(item =>
            JSON.stringify({ ...item, _scraped_at: scrapedAt, _run_type: runType })).join('\n') + '\n');
 
        console.log(`-> Willhaben Seite ${page}: ${fresh.length} Anzeigen (Gesamt: ${allListings.length})`);
        page++;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
 
    console.log(`Willhaben fertig: ${allListings.length} Wohnungen gespeichert.\n`);
    return allListings.length;
}
 
module.exports = { scrapeWillhaben, getListings };
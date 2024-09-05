const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = path.join(__dirname, '../public/data.xlsx');
const urlsListPath = path.join(__dirname, '../public/scrapedUrls.json');

// Fonction pour lire les URLs existantes depuis le fichier Excel
function readExistingData() {
    if (fs.existsSync(filePath)) {
        const workbook = XLSX.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        return new Set(data.slice(1).map(row => row[0])); // Collecte des URLs existantes
    } else {
        return new Set(); // Pas de données existantes
    }
}

// Fonction pour mettre à jour le fichier Excel
function updateExcelFile(newData) {
    let workbook;
    if (fs.existsSync(filePath)) {
        workbook = XLSX.readFile(filePath);
    } else {
        workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([['URL', 'Numéro de téléphone', 'Adresse e-mail']]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const existingUrls = new Set(existingData.slice(1).map(row => row[0]));

    newData.forEach(row => {
        if (!existingUrls.has(row[0])) {
            XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
        }
    });

    XLSX.writeFile(workbook, filePath);
}

// Fonction pour lire les URLs stockées en mémoire
function readScrapedUrls() {
    if (fs.existsSync(urlsListPath)) {
        return new Set(JSON.parse(fs.readFileSync(urlsListPath, 'utf8')));
    } else {
        return new Set(); // Pas de données existantes
    }
}

// Fonction pour écrire les URLs stockées en mémoire
function writeScrapedUrls(urls) {
    fs.writeFileSync(urlsListPath, JSON.stringify(Array.from(urls), null, 2));
}

// Fonction pour extraire les URLs
async function searchUrls(browser, searchQuery, maxResults) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let urls = await page.$$eval('a', links => 
        links.map(link => link.href)
            .filter((href, index, self) => self.indexOf(href) === index) // Remove duplicates
            .filter(href => href.startsWith('http') && !href.includes('google'))
    );

    // Limit to maxResults
    urls = urls.slice(0, maxResults);

    await page.close();
    return urls;
}

// Fonction pour extraire les informations de contact
async function scrapeContactInfo(browser, urls) {
    const results = [];
    
    const phoneNumberRegex = /(\+33\s?\d{1,2}|\d{1,2}|\+?\d{1,2}|\d{2,4})(\s?\d{2,4}){3}/g;
    
    for (const url of urls) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        const phoneNumbers = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const rawPhoneNumbers = bodyText.match(phoneNumberRegex) || [];
            return rawPhoneNumbers
                .map(number => number.replace(/[^0-9\s+]/g, '').trim())
                .filter((number, index, self) => self.indexOf(number) === index)
                .map(number => {
                    // Normalize the phone number to the format +33 X XX XX XX XX
                    let normalizedNumber = number.replace(/\s+/g, ''); // Remove all spaces
                    if (normalizedNumber.startsWith('0')) {
                        normalizedNumber = '+33' + normalizedNumber.slice(1);
                    }
                    return normalizedNumber.match(/(\+\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)?.slice(1).join(' ') || null;
                })[0] || null;
        });

        const emails = await page.$$eval('a[href^="mailto:"]', links => 
            links.map(link => link.href.replace('mailto:', '').trim())
                .filter((email, index, self) => self.indexOf(email) === index)[0] || null
        );

        results.push([url, phoneNumbers, emails]);
        await page.close();
    }
    return results;
}

// Fonction principale pour exécuter le scraping
async function run(searchQuery, maxResults) {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    console.log("Browser launched!");

    const scrapedUrls = readScrapedUrls(); // Lire les URLs déjà scrapées en mémoire
    const newUrls = await searchUrls(browser, searchQuery, maxResults);

    // Filtrer les URLs pour enlever les doublons
    const filteredUrls = newUrls.filter(url => !scrapedUrls.has(url));

    if (filteredUrls.length === 0) {
        console.log('No new URLs to scrape.');
        await browser.close();
        return filePath; // Assurez-vous que le chemin du fichier est retourné même s'il n'y a pas de nouvelles URLs
    }

    console.log('Scraping contact information...');
    const contactInfo = await scrapeContactInfo(browser, filteredUrls);
    updateExcelFile(contactInfo);

    // Mettre à jour les URLs stockées en mémoire
    filteredUrls.forEach(url => scrapedUrls.add(url));
    writeScrapedUrls(scrapedUrls);

    console.log('Scraping completed.');
    await browser.close();
    return filePath; // Retourne le chemin du fichier Excel
}

module.exports = { run };

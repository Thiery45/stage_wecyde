const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Fonction principale de scraping
async function runScraping(searchQuery, location, maxResults) {
    const browser = await puppeteer.launch({ headless: true });
    const urls = await searchUrls(browser, `${searchQuery} ${location}`, maxResults);
    const contactInfo = await scrapeContactInfo(browser, urls);

    const csvPath = path.join(__dirname, '../public/results.csv');
    const csvContent = contactInfo.map(info => `${info.url},${info.phoneNumber},${info.email}`).join('\n');

    // Ajouter les nouvelles données sans écraser les anciennes
    if (fs.existsSync(csvPath)) {
        fs.appendFileSync(csvPath, '\n' + csvContent);
    } else {
        fs.writeFileSync(csvPath, 'URL,Phone Number,Email\n' + csvContent);
    }

    await browser.close();
    return contactInfo;
}

// Fonction pour rechercher des URLs sur Google
async function searchUrls(browser, searchQuery, maxResults) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let urls = await page.$$eval('a', links => 
        links.map(link => link.href)
            .filter(href => href.startsWith('http') && !href.includes('google'))
    );

    urls = urls.slice(0, maxResults);
    await page.close();
    return urls;
}

// Fonction pour scrapper les numéros de téléphone et les emails
async function scrapeContactInfo(browser, urls) {
    const results = [];
    for (const url of urls) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        const phoneNumbers = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,3}\)?[-.\s]?)?[\d.\s]{7,}/g;
            const rawPhoneNumbers = bodyText.match(phoneRegex) || [];
            return rawPhoneNumbers.map(number => number.replace(/[-.\s]/g, '').trim())[0] || null;
        });

        const emails = await page.$$eval('a[href^="mailto:"]', links => 
            links.map(link => link.href.replace('mailto:', '').trim())[0] || null
        );

        results.push({ url, phoneNumber: phoneNumbers, email: emails });
        await page.close();
    }
    return results;
}

module.exports = { runScraping };

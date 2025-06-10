import { RequestQueue, PlaywrightCrawler } from 'crawlee';
import { parseStringPromise } from 'xml2js'; // Dùng để parse XML sitemap con
import fs from 'fs';

const requestQueue = await RequestQueue.open();
const collectedUrls = new Set(); // Dùng để lưu các URL đã thu thập

const crawler = new PlaywrightCrawler({
    requestQueue,
    async requestHandler({ request, page }) {
        console.log(`Đang crawl: ${request.url}`);
        const html = await page.content();
        let urls = [];

        if (request.url.endsWith('sitemap.xml')) {
            // Nếu đây là sitemap tổng, ta tìm các sitemap con (resitemapXXX.xml)
            const regex = /<span>(https:\/\/thuvienphapluat\.vn\/resitemap[^<]+)<\/span>/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                urls.push(match[1]);
            }
        } else {
    try {
        // Thêm ignoreAttrs để bỏ namespace, và trim để xử lý khoảng trắng thừa
        const parsedXml = await parseStringPromise(html, {
            explicitArray: false,
            ignoreAttrs: true,
            trim: true
        });

                const urlEntries = parsedXml.urlset?.url || [];

                // Kiểm tra xem có phải mảng hay không
                if (Array.isArray(urlEntries)) {
                    urls = urlEntries.map(entry => entry.loc);
                } else if (urlEntries.loc) {
                    urls = [urlEntries.loc]; // Trường hợp chỉ có một URL trong sitemap
                }

                // Nếu vẫn không tìm thấy URL nào, thử dùng regex để lấy URL từ HTML
                if (urls.length === 0) {
                    const regexXml = /<loc>(https:\/\/thuvienphapluat\.vn\/[^<]+)<\/loc>/g;
                    let match;
                    while ((match = regexXml.exec(html)) !== null) {
                        urls.push(match[1]);
                    }
                }

                // Lưu vào danh sách tổng hợp, tránh trùng lặp
                urls.forEach(url => collectedUrls.add(url));

            } catch (error) {
                console.error('Lỗi phân tích XML:', error);
            }
        }

        // Debug: In kết quả để kiểm tra xem crawler có hoạt động đúng không
        console.log(`URL được tìm thấy tại ${request.url}:`, urls);

        // Đẩy sitemap con vào hàng đợi để xử lý tiếp
        for (const url of urls) {
            if (url.includes('resitemap')) {
                await requestQueue.addRequest({ url });
            }
        }
    },
});

// Chạy crawler từ sitemap tổng
await crawler.run(['https://thuvienphapluat.vn/sitemap.xml']);

// Sau khi hoàn tất, hiển thị toàn bộ danh sách URL đã thu thập
fs.writeFileSync('urls.txt', [...collectedUrls].join('\n'), 'utf-8');
console.log('Đã ghi toàn bộ URL vào file urls.txt');
/**
 * @X4R1S3
 *
 * File: lib/Utils/games/website-preview.js
 * About: Website preview module for the X4R1S3 WhatsApp protocol client.
 * Important exports: generateWebsitePreviewHtml, generateLinkPreviewHtml
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/**
 * Website Preview — Mirror any website inside WhatsApp chat
 *
 * Fetches an external website and renders it directly inside the chat bubble
 * using FOAHtmlPrimitiveDemoDONOTUSE. The content is inlined (no iframe)
 * so it works in WhatsApp's sandboxed WebView.
 *
 * Usage:
 *   const { generateWebsitePreviewHtml } = require('./website-preview');
 *   const html = await generateWebsitePreviewHtml('https://example.com');
 *   await sock.sendHtmlMessage(jid, { html });
 */

/**
 * Fetch a website and return a self-contained HTML string
 * that renders directly inside WhatsApp's chat bubble.
 *
 * @param {string} url - The website URL to mirror
 * @param {Object} [options]
 * @param {string} [options.height='600px'] - Preview height
 * @param {boolean} [options.showUrl=true] - Show the URL bar
 * @param {boolean} [options.showToolbar=true] - Show toolbar with open link button
 * @param {string} [options.theme='dark'] - 'dark' or 'light'
 * @returns {string} Self-contained HTML string
 */
export const generateWebsitePreviewHtml = async (url, options = {}) => {
    const { height = '600px', showUrl = true, showToolbar = true, theme = 'dark' } = options;
    const baseUrl = new URL(url);
    const isDark = theme === 'dark';

    let fetchedHtml = '';
    let fetchError = false;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000)
        });
        fetchedHtml = await response.text();
    } catch (err) {
        fetchError = true;
    }

    // Extract useful parts from fetched HTML
    const extracted = extractContent(fetchedHtml, url);

    const bg = isDark ? '#0a0a0a' : '#ffffff';
    const text = isDark ? '#e0e0e0' : '#1a1a1a';
    const textMuted = isDark ? '#888' : '#666';
    const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const barBg = isDark ? '#1a1a2e' : '#f5f5f5';
    const linkColor = '#4CAF50';

    return `<html><head><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.webview{width:100%;height:${height};position:relative;border-radius:12px;overflow:hidden;border:1px solid ${border};background:${bg}}

/* URL Bar */
.url-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:${barBg};border-bottom:1px solid ${border};font-size:12px}
.url-bar .lock{color:${linkColor};font-size:11px}
.url-bar .url{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${textMuted}}
.url-bar .refresh{cursor:pointer;color:${linkColor};padding:4px;font-size:14px}

/* Content Area */
.content{width:100%;height:calc(100% - ${showUrl ? '36px' : '0px'} - ${showToolbar ? '44px' : '0px'});overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:${isDark ? '#333' : '#ccc'} transparent}
.content::-webkit-scrollbar{width:4px}
.content::-webkit-scrollbar-thumb{background:${isDark ? '#333' : '#ccc'};border-radius:2px}

/* Extracted site content */
.site-title{font-size:18px;font-weight:700;color:${text};margin-bottom:8px}
.site-desc{font-size:13px;color:${textMuted};line-height:1.5;margin-bottom:12px}
.site-text{font-size:14px;color:${text};line-height:1.7}
.site-text a{color:${linkColor};text-decoration:none}
.site-text img{max-width:100%;height:auto;border-radius:8px;margin:8px 0;display:block}
.site-headings{font-size:15px;font-weight:600;color:${text};margin:16px 0 6px}
.site-list{padding-left:18px;font-size:13px;color:${text};line-height:1.8}
.site-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.site-link{display:inline-block;padding:4px 10px;background:${barBg};border:1px solid ${border};border-radius:6px;font-size:12px;color:${linkColor};text-decoration:none}
.site-images{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:10px 0}
.site-images img{width:100%;height:80px;object-fit:cover;border-radius:6px;background:${barBg}}

/* Error / Fallback state */
.error-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:30px;text-align:center}
.error-state .icon{font-size:48px;margin-bottom:12px}
.error-state h3{font-size:16px;color:${text};margin-bottom:6px}
.error-state p{font-size:13px;color:${textMuted};margin-bottom:16px;line-height:1.5}

/* Toolbar */
.toolbar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid ${border};background:${barBg}}
.toolbar .site-info{display:flex;align-items:center;gap:6px;font-size:11px;color:${textMuted}}
.toolbar .site-favicon{width:14px;height:14px;border-radius:3px;background:${border}}
.toolbar .open-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;background:${linkColor};color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer}
</style></head><body>
<div class="webview">
    ${showUrl ? `
    <div class="url-bar">
        <span class="lock">🔒</span>
        <span class="url">${baseUrl.hostname}${baseUrl.pathname.length > 1 ? baseUrl.pathname.substring(0, 30) + '...' : ''}</span>
        <span class="refresh" onclick="location.reload()">↻</span>
    </div>` : ''}

    <div class="content">
        ${fetchError ? `
        <div class="error-state">
            <div class="icon">🌐</div>
            <h3>${baseUrl.hostname}</h3>
            <p>Could not load this website directly. Tap the button below to open it in your browser.</p>
            <a href="${url}" style="display:inline-flex;align-items:center;gap:5px;padding:10px 20px;background:${linkColor};color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">🔗 Open Website</a>
        </div>` : `
        ${extracted.title ? `<div style="padding:16px">` : `<div style="padding:16px">`}
            ${extracted.favicon ? `<img src="${extracted.favicon}" style="width:20px;height:20px;border-radius:4px;margin-bottom:8px" onerror="this.style.display='none'">` : ''}
            ${extracted.title ? `<div class="site-title">${escapeHtml(extracted.title)}</div>` : ''}
            ${extracted.description ? `<div class="site-desc">${escapeHtml(extracted.description)}</div>` : ''}
            ${extracted.heroImage ? `<img src="${escapeHtml(extracted.heroImage)}" style="width:100%;border-radius:8px;margin-bottom:12px" onerror="this.style.display='none'">` : ''}
            ${extracted.images.length > 0 ? `
            <div class="site-images">
                ${extracted.images.slice(0, 6).map(img => `<img src="${escapeHtml(img)}" onerror="this.style.display='none'" loading="lazy">`).join('')}
            </div>` : ''}
            ${extracted.headings.length > 0 ? extracted.headings.slice(0, 5).map(h => `<div class="site-headings">${escapeHtml(h)}</div>`).join('') : ''}
            ${extracted.text ? `<div class="site-text">${escapeHtml(extracted.text).substring(0, 2000)}</div>` : ''}
            ${extracted.links.length > 0 ? `
            <div class="site-links">
                ${extracted.links.slice(0, 8).map(l => `<a href="${escapeHtml(l.url)}" class="site-link">${escapeHtml(l.text)}</a>`).join('')}
            </div>` : ''}
        </div>`}
    </div>

    ${showToolbar ? `
    <div class="toolbar">
        <div class="site-info">
            <div class="site-favicon"></div>
            <span>${baseUrl.hostname}</span>
        </div>
        <a href="${url}" class="open-btn">🔗 Open Site</a>
    </div>` : ''}
</div>
</body></html>`;
};

/**
 * Extract meaningful content from fetched HTML
 */
function extractContent(html, baseUrl) {
    if (!html) return { title: '', description: '', text: '', headings: [], links: [], images: [], favicon: '', heroImage: '' };

    const base = new URL(baseUrl);

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';

    // Meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
    let favicon = faviconMatch ? resolveUrl(faviconMatch[1], base) : `${base.origin}/favicon.ico`;

    // Hero image (og:image)
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const heroImage = ogImageMatch ? resolveUrl(ogImageMatch[1], base) : '';

    // Extract headings
    const headings = [];
    const headingRegex = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi;
    let hm;
    while ((hm = headingRegex.exec(html)) !== null) {
        headings.push(hm[1].trim());
    }

    // Extract links
    const links = [];
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let lm;
    while ((lm = linkRegex.exec(html)) !== null) {
        const href = lm[1].trim();
        const text = lm[2].trim();
        if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            links.push({ text: text.substring(0, 50), url: resolveUrl(href, base) });
        }
    }

    // Extract images
    const images = [];
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let im;
    while ((im = imgRegex.exec(html)) !== null) {
        const src = im[1].trim();
        if (src && !src.startsWith('data:')) {
            images.push(resolveUrl(src, base));
        }
    }

    // Extract text content (strip tags)
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

    // Take a reasonable chunk of text
    if (text.length > 2000) {
        text = text.substring(0, 2000) + '...';
    }

    return { title, description, text, headings: headings.slice(0, 10), links: links.slice(0, 20), images: images.slice(0, 12), favicon, heroImage };
}

/**
 * Resolve a relative URL against a base
 */
function resolveUrl(href, base) {
    try {
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('//')) return base.protocol + href;
        return new URL(href, base).href;
    } catch {
        return href;
    }
}

/**
 * Escape HTML entities for safe embedding
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generate a simple link preview (thumbnail + title + description)
 * without fetching — lighter weight alternative.
 *
 * @param {string} url - The URL to preview
 * @param {Object} [options]
 * @param {string} [options.title] - Override title
 * @param {string} [options.description] - Override description
 * @param {string} [options.image] - Override image URL
 * @returns {string} HTML string for link preview card
 */
export const generateLinkPreviewHtml = (url, options = {}) => {
    const { title, description, image } = options;
    const baseUrl = new URL(url);

    return `<html><head><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0}
.card{background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;max-width:100%}
.card-image{width:100%;height:160px;object-fit:cover;background:linear-gradient(135deg,#1a1a2e,#2d2d44)}
.card-body{padding:14px}
.card-title{font-size:16px;font-weight:600;color:#fff;margin-bottom:4px}
.card-desc{font-size:13px;color:#aaa;line-height:1.4;margin-bottom:8px}
.card-url{font-size:11px;color:#4CAF50;display:flex;align-items:center;gap:4px}
</style></head><body>
<a href="${url}" target="_blank" style="text-decoration:none">
    <div class="card">
        ${image ? `<img class="card-image" src="${image}" alt="" onerror="this.style.display='none'">` :
        `<div class="card-image" style="display:flex;align-items:center;justify-content:center;font-size:48px">🌐</div>`}
        <div class="card-body">
            <div class="card-title">${escapeHtml(title || baseUrl.hostname)}</div>
            <div class="card-desc">${escapeHtml(description || 'Click to visit ' + baseUrl.hostname)}</div>
            <div class="card-url">🔒 ${baseUrl.hostname}</div>
        </div>
    </div>
</a>
</body></html>`;
};

export default generateWebsitePreviewHtml;


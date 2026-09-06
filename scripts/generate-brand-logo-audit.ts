import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
    getBrandLogoDomain,
    getBrandLogoUrl,
    getBrandMonogram,
    usesCoverBrandLogo,
    usesWideBrandLogo,
} from '../src/components/design-lab/brandVisuals';

interface BrandRow {
    id: string;
    name: string;
}

interface LogoAuditItem {
    logoUrl: string | null;
    domain?: string;
    brands: BrandRow[];
}

const ROOT = process.cwd();
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(ROOT, 'data', 'cherrypicker.db');
const OUTPUT_DIRECTORY = path.join('/private/tmp', 'cherrypicker-logo-audit');
const PAGE_SIZE = 40;

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderTile(item: LogoAuditItem, index: number): string {
    const primaryBrand = item.brands[0];
    const isWide = usesWideBrandLogo(primaryBrand);
    const usesCoverFit = usesCoverBrandLogo(primaryBrand);
    const logo = item.logoUrl
        ? `<img src="http://localhost:3000${escapeHtml(item.logoUrl)}" alt="" />`
        : `<span class="monogram">${escapeHtml(getBrandMonogram(primaryBrand.name))}</span>`;
    const aliases = item.brands.slice(1).map(brand => brand.name).join(', ');

    return `
        <article class="tile">
            <span class="number">${index + 1}</span>
            <div class="logo ${isWide ? 'wide' : ''} ${usesCoverFit ? 'cover' : ''}">${logo}</div>
            <strong>${escapeHtml(primaryBrand.name)}</strong>
            ${aliases ? `<small>${escapeHtml(aliases)}</small>` : ''}
            <code>${escapeHtml(item.domain || 'no domain')}</code>
        </article>
    `;
}

function renderPage(
    title: string,
    items: LogoAuditItem[],
    pageIndex: number,
    totalPages: number,
    startIndex: number
): string {
    return `<!doctype html>
<html lang="ko">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} ${pageIndex + 1}/${totalPages}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 16px 12px 32px; background: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; }
        header { margin: 0 auto 12px; max-width: 390px; }
        h1 { margin: 0; font-size: 20px; letter-spacing: -0.04em; }
        p { margin: 4px 0 0; color: #64748b; font-size: 11px; }
        nav { display: flex; gap: 5px; margin-top: 10px; }
        nav a { border-radius: 8px; background: #e2e8f0; color: #334155; padding: 5px 8px; font-size: 10px; font-weight: 800; text-decoration: none; }
        nav a.current { background: #2563eb; color: white; }
        main { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 auto; max-width: 390px; }
        .tile { position: relative; display: flex; min-height: 128px; min-width: 0; flex-direction: column; align-items: center; border: 1px solid #e2e8f0; border-radius: 16px; background: white; padding: 7px 2px 5px; text-align: center; }
        .number { position: absolute; left: 5px; top: 4px; color: #94a3b8; font-size: 8px; font-weight: 800; }
        .logo { display: flex; width: 56px; height: 56px; flex: none; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(15, 23, 42, 0.06); border-radius: 16px; background: #f8fafc; }
        .logo.wide { width: 72px; }
        .logo img { width: 100%; height: 100%; object-fit: contain; padding: 2px; background: white; }
        .logo.cover img { object-fit: cover; padding: 0; }
        .monogram { font-size: 16px; font-weight: 900; line-height: 1; color: #475569; }
        strong { display: -webkit-box; min-height: 29px; margin-top: 5px; overflow: hidden; color: #1e293b; font-size: 11px; font-weight: 900; line-height: 1.25; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        small { display: block; max-width: 100%; margin-top: 2px; overflow: hidden; color: #64748b; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        code { display: block; max-width: 100%; margin-top: auto; overflow: hidden; color: #94a3b8; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
    </style>
</head>
<body>
    <header>
        <h1>${escapeHtml(title)} · ${pageIndex + 1}/${totalPages}</h1>
        <p>F2 실제 크기(56px, GS25·이마트24 72px) 기준 · 중복 URL은 한 번만 표시</p>
        <nav>${Array.from({ length: totalPages }, (_, index) => (
            `<a class="${index === pageIndex ? 'current' : ''}" href="page-${index + 1}.html">${index + 1}</a>`
        )).join('')}</nav>
    </header>
    <main>${items.map((item, index) => renderTile(item, startIndex + index)).join('')}</main>
</body>
</html>`;
}

async function main() {
    const database = new Database(DATABASE_PATH, { readonly: true });
    const brands = database.prepare('select id, name from brands order by name').all() as BrandRow[];
    database.close();

    const grouped = new Map<string, LogoAuditItem>();
    const uncovered: LogoAuditItem[] = [];
    for (const brand of brands) {
        const logoUrl = getBrandLogoUrl(brand);
        const domain = getBrandLogoDomain(brand);
        if (!logoUrl) {
            uncovered.push({ logoUrl, domain, brands: [brand] });
            continue;
        }
        const existing = grouped.get(logoUrl);
        if (existing) {
            existing.brands.push(brand);
        } else {
            grouped.set(logoUrl, { logoUrl, domain, brands: [brand] });
        }
    }

    const logos = [...grouped.values()].sort((left, right) => (
        left.brands[0].name.localeCompare(right.brands[0].name, 'ko-KR')
    ));
    const totalPages = Math.ceil(logos.length / PAGE_SIZE);
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const startIndex = pageIndex * PAGE_SIZE;
        const pageItems = logos.slice(startIndex, startIndex + PAGE_SIZE);
        await writeFile(
            path.join(OUTPUT_DIRECTORY, `page-${pageIndex + 1}.html`),
            renderPage('브랜드 로고 전수검수', pageItems, pageIndex, totalPages, startIndex)
        );
    }
    await writeFile(
        path.join(OUTPUT_DIRECTORY, 'audit.json'),
        `${JSON.stringify({ logos, uncovered }, null, 2)}\n`
    );
    process.stdout.write(
        `Generated ${logos.length} unique logos across ${totalPages} pages; ` +
        `${uncovered.length} brands use monograms.\n`
    );
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

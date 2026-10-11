import './load-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCardBenefitRevisionSources } from '../src/lib/card-benefit-ingestion';

/**
 * Writes the official texts a reviewed revision is checked against next to the texts behind the
 * published rules, so a session can diff them and write the revision spec without AI.
 *   tsx scripts/card-benefit-sources.ts --card=<id> --out=<dir>
 * <dir>/published and <dir>/current hold one text file per official source (same name for the
 * same URL, ready for `diff -ru`), <dir>/published-extraction.json the approved extraction that a
 * revision patches. The printed bundle hash goes into the spec's `sourceBundleHash`.
 */
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const fileName = (sourceUrl: string) => {
    const url = new URL(sourceUrl);
    return `${`${url.hostname}${url.pathname}${url.search}`.replace(/[^a-zA-Z0-9.-]+/g, '_').slice(0, 150)}.txt`;
};

function main() {
    const cardId = argument('card');
    const out = argument('out');
    if (!cardId || !out) throw new Error('--card=<카드 ID>와 --out=<폴더>가 필요합니다.');
    const sources = getCardBenefitRevisionSources(cardId);
    const directory = resolve(out);
    const write = (folder: string, documents: typeof sources.current.documents) => {
        mkdirSync(join(directory, folder), { recursive: true });
        documents.forEach(document => writeFileSync(
            join(directory, folder, fileName(document.sourceUrl)),
            document.extractedText,
        ));
    };
    write('current', sources.current.documents);
    if (sources.published) {
        write('published', sources.published.documents);
        writeFileSync(
            join(directory, 'published-extraction.json'),
            `${JSON.stringify(sources.published.extraction, null, 2)}\n`,
        );
    }

    console.log(`${sources.cardName} (${sources.cardId}) · ` +
        `${sources.activeRevision ? `revision ${sources.activeRevision}` : '미게시'} · ` +
        `current ${sources.current.extractor} ${sources.current.candidateId}`);
    console.log(`sourceBundleHash: ${sources.current.sourceBundleHash ?? '(없음)'}`);
    console.log(sources.current.revisionRequired
        ? `검토된 수정안 필요 (감지 ${sources.current.createdAt})`
        : '수정안 대기 중인 원문 변경 없음');
    const publishedByUrl = new Map((sources.published?.documents ?? [])
        .map(document => [document.sourceUrl, document]));
    sources.current.documents.forEach(document => {
        const before = publishedByUrl.get(document.sourceUrl);
        const state = !sources.published ? 'new card'
            : !before ? 'added'
            : before.semanticHash === document.semanticHash ? 'same' : `changed v${before.version}→`;
        console.log(`- ${document.role} ${state} v${document.version} ${document.mediaType} ` +
            `${document.extractedText.length.toLocaleString()} chars: ${document.sourceUrl}`);
    });
    const currentUrls = new Set(sources.current.documents.map(document => document.sourceUrl));
    (sources.published?.documents ?? []).filter(document => !currentUrls.has(document.sourceUrl))
        .forEach(document => console.log(`- ${document.role} removed v${document.version}: ${document.sourceUrl}`));
    if (sources.current.revisionRequired) {
        console.log(`\n기존 규칙을 새 원문으로 검증한 오류 ${sources.current.validationErrors.length}건:`);
        sources.current.validationErrors.forEach(error => console.log(`  ! ${error}`));
    }
    console.log(`\n원문 파일: ${directory}`);
}

main();

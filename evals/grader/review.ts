import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SpikeResult } from '../spike/pipeline';
import type { AutoGrade, HumanGrade } from './index';
import { describeArtDirection } from '@/lib/render/art-direction';
import { contractFor } from '@/lib/ai/sections/contracts';
import type { Composition, SectionInstance } from '@/lib/contracts';

/**
 * The reading sheet for the three human columns.
 *
 * `copySensible`, `sectionSelectionAppropriate` and `artDirectionAppropriate`
 * are the grader rows a machine cannot fill, and they stay `null` until someone
 * reads the output. That is correct, and it is also why they never get filled:
 * the copy lives inside `raw.json`, several levels down, interleaved with token
 * counts and provider names.
 *
 * This renders each generated page as prose next to a blank score line, so the
 * job is reading rather than excavating. It emits the JSON sheet alongside, so
 * scores can be typed straight back into the grader.
 *
 *   npm run review -- evals/grader/results/<run>
 */

function copyOf(section: SectionInstance): string[] {
    const contract = contractFor(section.type);
    const props = section.props as Record<string, unknown>;
    const lines: string[] = [];

    for (const field of contract.fields) {
        if (field.type === 'color') continue;
        const value = props[field.key];
        if (value === undefined || value === null || value === '') continue;

        if (field.type === 'image') {
            const img = value as { query?: string; alt?: string };
            lines.push(`- _${field.label}_: photo search “${img.query}” — alt “${img.alt}”`);
        } else if (field.type === 'list' && Array.isArray(value)) {
            lines.push(`- _${field.label}_:`);
            value.forEach((item, i) => {
                const cells = Object.entries(item as Record<string, unknown>)
                    .filter(([, v]) => v !== undefined && v !== '')
                    .map(([k, v]) => `${k}: ${String(v)}`);
                lines.push(`    ${i + 1}. ${cells.join(' · ')}`);
            });
        } else {
            lines.push(`- _${field.label}_: ${String(value)}`);
        }
    }

    return lines;
}

function renderPage(result: SpikeResult, grade: AutoGrade): string[] {
    const composition = result.composition as Composition;

    const lines = [
        `## ${grade.id} · ${grade.vertical}`,
        '',
        `> ${result.prompt}`,
        '',
        `**Art direction:** ${describeArtDirection(composition.artDirection)}`,
        '',
        `**Plan:** ${composition.sections.map((s) => `${s.type}/${s.variant}`).join(' → ')}`,
        '',
        `Objective grade: ${grade.passed ? 'pass' : 'FAIL'} · `
        + `${grade.sectionCount} sections · ${grade.blankFields.length} blank fields · `
        + `category ${grade.categoryCorrect ? 'ok' : 'wrong'}`,
        '',
    ];

    for (const section of composition.sections) {
        lines.push(`### ${section.type} — \`${section.variant}\``);
        if (section.brief) lines.push(`_Brief: ${section.brief}_`, '');
        lines.push(...copyOf(section), '');
    }

    lines.push(
        '**Score this page** — 1 to 5, or leave blank if you did not read it:',
        '',
        '| Column | Score | Ask yourself |',
        '|---|---|---|',
        '| copySensible | | Would the owner send this to a customer without editing it? |',
        '| sectionSelectionAppropriate | | Are these the sections this business needs — nothing missing, nothing odd? |',
        '| artDirectionAppropriate | | Does it *feel* like this kind of business? |',
        '',
        'Notes:',
        '',
        '---',
        '',
    );

    return lines;
}

function main(): void {
    const argv = process.argv.slice(2);
    const paths = argv.filter((a) => !a.startsWith('--'));
    const RESULTS = join(process.cwd(), 'evals/grader/results');

    const dir = paths[0] ?? (existsSync(RESULTS)
        ? readdirSync(RESULTS).map((d) => join(RESULTS, d))
            .filter((d) => existsSync(join(d, 'raw.json')))
            .sort().reverse()[0]
        : undefined);

    if (!dir || !existsSync(join(dir, 'raw.json'))) {
        console.error('usage: npm run review -- <results-dir>');
        process.exit(2);
    }

    const raw: SpikeResult[] = JSON.parse(readFileSync(join(dir, 'raw.json'), 'utf8'));
    const grades: AutoGrade[] = JSON.parse(readFileSync(join(dir, 'grades.json'), 'utf8'));

    const readable = grades
        .map((g, i) => ({ grade: g, result: raw[i] }))
        .filter((p) => p.result?.ok && p.result.composition);

    if (readable.length === 0) {
        console.error(`No completed generations in ${dir} — nothing to read.`);
        process.exit(2);
    }

    const doc = [
        '# Human review sheet',
        '',
        `${readable.length} generated page(s) from \`${dir.split('/').pop()}\`.`,
        '',
        'These are the three grader columns a machine cannot fill. They default to',
        '`null` and stay there until someone reads the output — a typed-in `3` for',
        'a page nobody looked at is how an unread row becomes evidence.',
        '',
        'Score what you read. Leave the rest blank; the summary reports a mean only',
        'once a column is complete, and reports the unread count otherwise.',
        '',
        '---',
        '',
        ...readable.flatMap((p) => renderPage(p.result, p.grade)),
    ].join('\n');

    const docPath = join(dir, 'REVIEW.md');
    writeFileSync(docPath, doc);

    // The machine-readable half, ready to hand back via --human=
    const sheet: HumanGrade[] = readable.map((p) => ({
        id: p.grade.id,
        copySensible: null,
        sectionSelectionAppropriate: null,
        artDirectionAppropriate: null,
        notes: '',
    }));
    const sheetPath = join(dir, 'human-sheet.json');
    if (!existsSync(sheetPath)) writeFileSync(sheetPath, JSON.stringify(sheet, null, 2));

    console.log(`${readable.length} page(s) to read.`);
    console.log(`read  -> ${docPath}`);
    console.log(`score -> ${sheetPath}`);
    console.log(`\nthen: npm run grade -- --human=${sheetPath} --resume=${dir}`);
}

main();

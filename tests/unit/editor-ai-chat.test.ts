import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/lib/editor-store';
import type { Composition, EditProposal } from '@/lib/contracts';

function sample(): Composition {
    return {
        schemaVersion: 3,
        vertical: 'consultant',
        artDirection: {
            themeId: 'clinical-blue',
            motionId: 'calm',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'bright-clean',
        },
        meta: { title: 'Test', description: 'Test', lang: 'en' },
        sections: [
            {
                id: 's1', type: 'hero', variant: 'centred', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'Old heading' },
            },
        ],
    };
}

function jsonResponse(body: unknown) {
    return { json: async () => body } as Response;
}

const proposal: EditProposal = {
    targetSectionId: 's1',
    patch: [{ op: 'replace', path: '/props/heading', value: 'New heading' }],
    explanation: 'Makes the heading clearer.',
    applied: false,
};

function fakeServer() {
    return vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes('/edits')) {
            return jsonResponse({ ok: true, data: proposal });
        }
        if (path.includes('/commits')) {
            return jsonResponse({ ok: true, data: { sha: 'pre-edit' } });
        }
        return jsonResponse({ ok: true, data: { projectId: 'p1', files: {}, updatedAt: 'now' } });
    });
}

beforeEach(() => {
    const composition = sample();
    const { vfs } = useEditorStore.getState();
    vfs.reset();
    vfs.seed({
        'index.html': '<h1>Old heading</h1>',
        'composition.json': JSON.stringify(composition, null, 2),
    });
    useEditorStore.setState({
        projectId: 'p1',
        composition,
        selectedSectionId: 's1',
        pendingChange: null,
        chatMessages: [],
        chatBusy: false,
        chatError: null,
        chatProgress: null,
        chatJob: null,
        saving: false,
        saveError: null,
        lastCommitSha: null,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AI chat (D11–D15)', () => {
    it('rejects Starter sites asking for Pro or Premium aesthetics', async () => {
        const { vfs } = useEditorStore.getState();
        vfs.write(
            'index.html',
            '<html><body data-style="casual"><header class="site-header"></header><h1>Old</h1></body></html>',
        );
        const fetchMock = fakeServer();
        vi.stubGlobal('fetch', fetchMock);

        await useEditorStore.getState().requestAiEdit('Add liquid glass continuous scroll');
        expect(useEditorStore.getState().chatError).toMatch(/Premium/);
        expect(fetchMock).not.toHaveBeenCalled();

        await useEditorStore.getState().requestAiEdit('Make it look like Pro');
        expect(useEditorStore.getState().chatError).toMatch(/Pro/);
    });

    it('saves a version, then proposes without writing the file', async () => {
        const fetchMock = fakeServer();
        vi.stubGlobal('fetch', fetchMock);

        const before = useEditorStore.getState().vfs.read('composition.json');
        await useEditorStore.getState().requestAiEdit('Make the heading shorter');

        const called = fetchMock.mock.calls.map(([url]) => String(url));
        expect(called.some((url) => url.includes('/commits'))).toBe(true);
        expect(called.some((url) => url.includes('/edits'))).toBe(true);
        expect(useEditorStore.getState().lastCommitSha).toBe('pre-edit');
        expect(useEditorStore.getState().vfs.read('composition.json')).toBe(before);
        expect(useEditorStore.getState().pendingChange?.explanation).toBe(
            'Makes the heading clearer.',
        );
        expect(useEditorStore.getState().pendingChange?.after).toContain('New heading');
    });

    it('leaves the file untouched when the suggestion is discarded', async () => {
        vi.stubGlobal('fetch', fakeServer());

        const beforeJson = useEditorStore.getState().vfs.read('composition.json');
        const beforeHtml = useEditorStore.getState().vfs.read('index.html');

        await useEditorStore.getState().requestAiEdit('Make the heading shorter');
        useEditorStore.getState().rejectChange();

        expect(useEditorStore.getState().vfs.read('composition.json')).toBe(beforeJson);
        expect(useEditorStore.getState().vfs.read('index.html')).toBe(beforeHtml);
        expect(useEditorStore.getState().pendingChange).toBeNull();
        expect(useEditorStore.getState().vfs.dirtyPaths()).toEqual([]);
    });

    it('writes the new composition when the suggestion is kept', async () => {
        vi.stubGlobal('fetch', fakeServer());

        await useEditorStore.getState().requestAiEdit('Make the heading shorter');
        useEditorStore.getState().acceptChange();

        expect(useEditorStore.getState().composition?.sections[0].props.heading).toBe('New heading');
        expect(useEditorStore.getState().vfs.read('composition.json')).toContain('New heading');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('New heading');
        expect(useEditorStore.getState().pendingChange).toBeNull();
    });

    it('refuses a locked section', async () => {
        const composition = sample();
        composition.sections[0].locked = true;
        useEditorStore.setState({ composition });

        await useEditorStore.getState().requestAiEdit('Change it');

        expect(useEditorStore.getState().chatError).toMatch(/locked/i);
        expect(useEditorStore.getState().pendingChange).toBeNull();
    });

    it('renames the business across the site without calling the edits API', async () => {
        const composition = sample();
        composition.meta.title = 'Ravi Clothing';
        composition.meta.description = 'Ravi Clothing in Bangalore';
        composition.sections[0].props = {
            heading: 'Ravi Clothing',
            sub: 'Nice clothes from Ravi Clothing',
        };
        composition.sections.push({
            id: 's2',
            type: 'footer',
            variant: 'simple',
            brief: '',
            visible: true,
            locked: false,
            source: 'ai',
            props: { tagline: 'Ravi Clothing – Bangalore' },
        });
        useEditorStore.setState({ composition });
        useEditorStore.getState().vfs.write(
            'composition.json',
            JSON.stringify(composition, null, 2),
        );

        const fetchMock = fakeServer();
        vi.stubGlobal('fetch', fetchMock);

        await useEditorStore.getState().requestAiEdit(
            'change ravi clothing to Pragna clothing',
        );

        const called = fetchMock.mock.calls.map(([url]) => String(url));
        expect(called.some((url) => url.includes('/edits'))).toBe(false);
        expect(called.some((url) => url.includes('/commits'))).toBe(true);

        const pending = useEditorStore.getState().pendingChange;
        expect(pending?.after).toContain('Pragna clothing');
        expect(pending?.after).not.toMatch(/Ravi Clothing/i);
        expect(pending?.explanation).toMatch(/Pragna clothing/i);

        useEditorStore.getState().acceptChange();
        expect(useEditorStore.getState().composition?.meta.title).toBe('Pragna clothing');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('Pragna clothing');
    });
});

function generatedSite(): Composition {
    return {
        schemaVersion: 3,
        vertical: 'sweet-shop',
        artDirection: {
            themeId: 'sunlit-craft',
            motionId: 'calm',
            radiusId: 'soft',
            spacingId: 'default',
            imageryId: 'warm-natural',
        },
        meta: { title: 'Sugar & Co', description: 'Sweets made today', lang: 'en' },
        sections: [
            {
                id: 'hero', type: 'hero', variant: 'centred', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'Handmade sweets', ctaLabel: 'See the trays' },
            },
            {
                id: 'about', type: 'about', variant: 'text', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'The shop', body: 'Trays from 8am.' },
            },
            {
                id: 'menu', type: 'menu', variant: 'simple', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'Today', items: [{ name: 'Jalebi', description: 'Hot', price: '40' }] },
            },
            {
                id: 'contact', type: 'contact', variant: 'simple', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'Visit', email: 'hi@sugar.test' },
            },
            {
                id: 'footer', type: 'footer', variant: 'simple', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { tagline: 'Sugar & Co' },
            },
        ],
    };
}

function generateServer() {
    const site = generatedSite();
    return vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes('/generate')) {
            return jsonResponse({ ok: true, data: { job_id: 'job_1' } });
        }
        if (path.includes('/jobs/')) {
            return jsonResponse({
                ok: true,
                data: {
                    status: 'done',
                    sections_done: 5,
                    sections_total: 5,
                    elapsed_ms: 20,
                    files_ready: true,
                    composition: site,
                },
            });
        }
        if (path.includes('/commits')) {
            return jsonResponse({ ok: true, data: { sha: 'pre-gen' } });
        }
        return jsonResponse({ ok: true, data: { projectId: 'p1', files: {}, updatedAt: 'now' } });
    });
}

describe('AI chat — full site from Ask', () => {
    // The cross-vertical firewall blocks "create a sweet-shop site" when the
    // existing composition is a different business type. Align the sample to
    // the request so the firewall lets it through — that is the real scenario.
    beforeEach(() => {
        const composition = { ...useEditorStore.getState().composition! };
        composition.vertical = 'sweet-shop';
        useEditorStore.setState({ composition });
    });

    it('proposes a generated site without writing files', async () => {
        const fetchMock = generateServer();
        vi.stubGlobal('fetch', fetchMock);

        const beforeHtml = useEditorStore.getState().vfs.read('index.html');
        await useEditorStore.getState().requestAiEdit('Create a sweet shop website');

        const called = fetchMock.mock.calls.map(([url]) => String(url));
        expect(called.some((url) => url.includes('/generate'))).toBe(true);
        expect(called.some((url) => url.includes('/jobs/'))).toBe(true);
        expect(called.some((url) => url.includes('/edits'))).toBe(false);
        expect(useEditorStore.getState().vfs.read('index.html')).toBe(beforeHtml);
        expect(useEditorStore.getState().pendingChange?.after).toContain('Handmade sweets');
        expect(useEditorStore.getState().pendingChange?.explanation).toContain('Sugar & Co');
    });

    it('keeps the generated files in the tree', async () => {
        vi.stubGlobal('fetch', generateServer());

        await useEditorStore.getState().requestAiEdit('Create a sweet shop website');
        useEditorStore.getState().acceptChange();

        expect(useEditorStore.getState().composition?.meta.title).toBe('Sugar & Co');
        expect(useEditorStore.getState().vfs.read('composition.json')).toContain('Handmade sweets');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('Handmade sweets');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('site-header');
        expect(useEditorStore.getState().pendingChange).toBeNull();
    });

    it('discards a generated site and leaves the project as it was', async () => {
        // This test asks for a restaurant — align the vertical.
        const composition = { ...useEditorStore.getState().composition! };
        composition.vertical = 'restaurant';
        useEditorStore.setState({ composition });
        vi.stubGlobal('fetch', generateServer());

        const beforeJson = useEditorStore.getState().vfs.read('composition.json');
        const beforeHtml = useEditorStore.getState().vfs.read('index.html');

        await useEditorStore.getState().requestAiEdit('Create a restaurant website');
        useEditorStore.getState().rejectChange();

        expect(useEditorStore.getState().vfs.read('composition.json')).toBe(beforeJson);
        expect(useEditorStore.getState().vfs.read('index.html')).toBe(beforeHtml);
        expect(useEditorStore.getState().pendingChange).toBeNull();
        expect(useEditorStore.getState().vfs.dirtyPaths()).toEqual([]);
    });

    it('generates a site when the page has no sections yet', async () => {
        const { vfs } = useEditorStore.getState();
        vfs.reset();
        vfs.seed({ 'index.html': '<p>Empty</p>' });
        useEditorStore.setState({ composition: null, selectedSectionId: null });
        vi.stubGlobal('fetch', generateServer());

        await useEditorStore.getState().requestAiEdit('a gym landing page');

        expect(useEditorStore.getState().pendingChange?.after).toContain('Handmade sweets');
        expect(useEditorStore.getState().vfs.read('index.html')).toBe('<p>Empty</p>');
    });
});

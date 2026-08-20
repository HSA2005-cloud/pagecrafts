import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useEditorStore } from '@/lib/editor-store';
import type { Composition } from '@/lib/contracts';

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
                props: { heading: 'Hello' },
            },
            {
                id: 's2', type: 'services', variant: 'cards', brief: '',
                visible: true, locked: false, source: 'ai',
                props: { heading: 'Services' },
            },
        ],
    };
}

function jsonResponse(body: unknown) {
    return { json: async () => body } as Response;
}

beforeEach(() => {
    useEditorStore.getState().vfs.reset();
    useEditorStore.setState({
        projectId: null,
        composition: null,
        selectedSectionId: null,
        pendingChange: null,
        saving: false,
        saveError: null,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('editor QA (D16–D20)', () => {
    it('loads composition.json when a project opens', async () => {
        const composition = sample();
        vi.stubGlobal('fetch', vi.fn(async () =>
            jsonResponse({
                ok: true,
                data: {
                    projectId: 'p1',
                    files: {
                        'index.html': '<h1>Hello</h1>',
                        'composition.json': JSON.stringify(composition),
                    },
                    updatedAt: 'now',
                    name: 'Clinic',
                },
            }),
        ));

        await useEditorStore.getState().loadProject('p1');

        expect(useEditorStore.getState().composition?.sections.map((s) => s.id)).toEqual(['s1', 's2']);
        expect(useEditorStore.getState().selectedSectionId).toBe('s1');
        expect(useEditorStore.getState().loadError).toBeNull();
    });

    it('reorders a section and regenerates the page without a provider call', () => {
        const composition = sample();
        const { vfs } = useEditorStore.getState();
        vfs.seed({
            'index.html': '<h1>Hello</h1>',
            'composition.json': JSON.stringify(composition),
        });
        useEditorStore.setState({ composition, selectedSectionId: 's1', projectId: 'p1' });

        useEditorStore.getState().moveSectionDown('s1');

        const next = useEditorStore.getState().composition;
        expect(next?.sections.map((s) => s.id)).toEqual(['s2', 's1']);
        expect(useEditorStore.getState().vfs.read('composition.json')).toContain('"id": "s2"');
    });

    it('restyles the page without a provider call', () => {
        const composition = sample();
        const { vfs } = useEditorStore.getState();
        vfs.seed({
            'index.html': '<h1>Hello</h1>',
            'composition.json': JSON.stringify(composition),
        });
        useEditorStore.setState({ composition, selectedSectionId: 's1', projectId: 'p1' });

        useEditorStore.getState().restyleComposition({ themeId: 'vivid-energy', motionId: 'kinetic' });

        expect(useEditorStore.getState().composition?.artDirection.themeId).toBe('vivid-energy');
        expect(useEditorStore.getState().composition?.artDirection.motionId).toBe('kinetic');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('#e11d48');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('data-motion="kinetic"');
    });

    it('rebuilds the site when composition.json is edited', () => {
        const composition = sample();
        const { vfs } = useEditorStore.getState();
        vfs.seed({
            'index.html': '<h1>Hello</h1>',
            'composition.json': JSON.stringify(composition),
        });
        useEditorStore.setState({
            composition,
            selectedSectionId: 's1',
            projectId: 'p1',
            activeFile: 'composition.json',
        });

        const next = {
            ...composition,
            sections: [
                { ...composition.sections[0], props: { heading: 'Edited heading' } },
                composition.sections[1],
            ],
        };
        useEditorStore.getState().writeActive(JSON.stringify(next));

        expect(useEditorStore.getState().composition?.sections[0].props.heading).toBe('Edited heading');
        expect(useEditorStore.getState().vfs.read('index.html')).toContain('Edited heading');
        expect(useEditorStore.getState().vfs.read('composition.json')).toContain('Edited heading');
    });

    it('keeps suggested-change copy in plain language', () => {
        const summary = readFileSync('src/components/editor/ChangeSummary.tsx', 'utf8');
        expect(summary).not.toMatch(/diff|patch|commit|hunk/i);
        expect(summary).toContain('Keep this change');
        expect(summary).toContain('Discard');
    });

    it('exposes restyle controls in the sections panel', () => {
        const panel = readFileSync('src/components/editor/SectionsPanel.tsx', 'utf8');
        expect(panel).toContain('restyleComposition');
        expect(panel).toContain('LOOK_DIALS');
        expect(panel).toContain('Look');
        expect(panel).not.toMatch(/\bdiff\b|\bhunk\b|\bcommit\b/i);
    });

    it('turns off motion for people who asked for less of it', () => {
        const css = readFileSync('src/app/globals.css', 'utf8');
        expect(css).toContain('prefers-reduced-motion');
        expect(css).toContain('skeleton-pulse');
    });

    it('offers a skip link into the preview', () => {
        const shell = readFileSync('src/components/editor/EditorShell.tsx', 'utf8');
        expect(shell).toContain('Skip to preview');
        expect(shell).toContain('#editor-preview');
        expect(shell).toContain('ChatPanel');
    });

    it('reserves a box for the preview so the layout does not jump', () => {
        const preview = readFileSync('src/components/editor/PreviewPane.tsx', 'utf8');
        expect(preview).toContain('min-h-[320px]');
        expect(preview).toContain('absolute inset-0');
    });

    it('keeps the default editor as chat plus your site', () => {
        const shell = readFileSync('src/components/editor/EditorShell.tsx', 'utf8');
        expect(shell).not.toContain('ContentPanel');
        expect(shell).toContain('ChatPanel');
        expect(shell).toContain('EditorSplit');
        const split = readFileSync('src/components/editor/EditorSplit.tsx', 'utf8');
        expect(split).toContain('DEFAULT_LEFT = 30');
        expect(split).toContain('role="separator"');
        expect(shell).toContain('sectionsOpen && composition');
        expect(shell).toContain("get('ask') === '1'");
        const preview = readFileSync('src/components/editor/PreviewPane.tsx', 'utf8');
        expect(preview).toContain('Your site');
        expect(preview).toContain('Phone');
        expect(preview).toContain('Preview');
        const composer = readFileSync('src/components/editor/ChatComposer.tsx', 'utf8');
        expect(composer).toContain('Queue follow-up');
        expect(composer).toContain('Set up a custom domain');
        expect(composer).toContain('Get started');
        expect(composer).toContain('Custom domains are coming');
        const topBar = readFileSync('src/components/editor/TopBar.tsx', 'utf8');
        expect(topBar).toContain('Back to Templates');
        expect(topBar).toContain('href="/#build"');
        expect(topBar).toContain('Save');
    });

    it('loads Your site from a blob URL instead of srcDoc', () => {
        const preview = readFileSync('src/components/editor/PreviewPane.tsx', 'utf8');
        expect(preview).not.toMatch(/srcDoc/i);
        expect(preview).toContain('previewDocumentUrl');
        expect(preview).toContain('src={frameUrl}');
        expect(preview).toContain('filesForPreview');
        expect(preview).toContain('PREVIEW_IFRAME_SANDBOX');
        const helper = readFileSync('src/lib/editor/preview-frame.ts', 'utf8');
        expect(helper).toContain('createObjectURL');
        const sandbox = readFileSync('src/lib/preview-security.ts', 'utf8');
        expect(sandbox).toContain("PREVIEW_IFRAME_SANDBOX = 'allow-scripts allow-forms'");
        expect(sandbox).not.toMatch(/SANDBOX = '[^']*allow-same-origin/);
    });

    it('lets Ask generate a whole site from a prompt', () => {
        const chat = readFileSync('src/components/editor/ChatPanel.tsx', 'utf8');
        expect(chat).toContain('whole new website');
        expect(chat).toContain('Suggested next steps');
        const suggestions = readFileSync('src/lib/editor/chat-suggestions.ts', 'utf8');
        expect(suggestions).toContain('Create a sweet shop website');
        const store = readFileSync('src/lib/editor-store.ts', 'utf8');
        expect(store).toContain('isSiteGenerationRequest');
        expect(store).toContain('generateSiteProposal');
        expect(store).toContain('cancelAiEdit');
    });
});

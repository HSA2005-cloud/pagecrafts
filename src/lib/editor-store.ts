'use client';
import { create } from 'zustand';
import { VFS } from '@/lib/vfs';
import { validatePath, type PathError } from '@/lib/paths';
import {
    loadCommits,
    loadProjectDetail,
    loadProjectFiles,
    restoreVersion,
    saveProjectContent,
    saveProjectFiles,
    saveProjectSettings,
    createCommit,
    pickEntryFile,
    proposeProjectEdit,
    proposeCopyEdit,
    proposePageEdit,
    type GenerationJobStatus,
} from '@/lib/project-source';
import { parseComposition } from '@/lib/editor/parse-composition';
import { applyEditPatch } from '@/lib/editor/apply-patch';
import { writeCompositionFiles, writeRenderedSite } from '@/lib/editor/sync-site';
import { sanitise } from '@/lib/ai/sanitise';
import { sectionVariants } from '@/lib/editor/section-registry';
import { isSiteGenerationRequest } from '@/lib/editor/site-intent';
import { styleUpgradeFirewall } from '@/lib/editor/style-firewall';
import { crossVerticalFirewall } from '@/lib/editor/cross-vertical-firewall';
import {
    offTopicWebsiteAsk,
    shouldUsePageEdit,
} from '@/lib/editor/website-ask-gate';
import {
    parseRenameIntent,
    renameComposition,
    renameExplanation,
} from '@/lib/editor/rename-site';
import { generateSiteProposal, generationExplanation } from '@/lib/editor/generate-site';
import { MAX_CLASSIFY_CHARS } from '@/lib/contracts';
import { debounceTrigger } from '@/lib/debounce';
import { compareText } from '@/lib/compare';
import { validateFieldValue } from '@/lib/content/apply-ops';
import {
    applySlotValue,
    emptyListItem,
    fieldAt,
    mergeContent,
    readContentFromHtml,
    type ListItem,
} from '@/lib/content/slots';
import { applySettingsToHtml } from '@/lib/content/site-meta';
import { wireOrderPayments } from '@/lib/sites/pay-page';
import {
    changeVariant, reorderSection, restyle, toggleLocked, toggleVisible,
} from '@/lib/editor/section-action';
import type {
    ArtDirection,
    Commit,
    Composition,
    ContentOp,
    ContentSchema,
    PatchProjectRequest,
    SiteMeta,
    TreeNode,
} from '@/lib/contracts';
import { parseStoredComposition } from '@/lib/ai/composition/migrate';
import { asContentSchema } from '@/lib/content/schema';

const vfs = new VFS();
const AUTOSAVE_DELAY_MS = 1500;
/** Bumped to ignore an in-flight Ask once the person taps stop. */
let chatEpoch = 0;
// Structured content goes to the server on its own beat: the markup is already updated
// locally, so this is the canonical copy catching up rather than anything the person waits
// for. Slower than autosave, because a batch of keystrokes is one op.
const CONTENT_SYNC_DELAY_MS = 900;

export type ContentValues = Record<string, Record<string, unknown>>;

export interface PendingChange {
    path: string;
    before: string;
    after: string;
    explanation: string;
    /** Extra HTML files from a multi-page Ask edit (path → after). */
    extraFiles?: Record<string, string>;
}

export interface ProposedChange {
    path: string;
    after: string;
    explanation: string;
    extraFiles?: Record<string, string>;
}

export interface ChatTurn {
    role: 'user' | 'assistant';
    text: string;
}

interface EditorState {
    vfs: VFS;
    projectId: string | null;
    tree: TreeNode | null;
    activeFile: string | null;
    dirtyPaths: string[];
    advanced: boolean;
    loading: boolean;
    loadError: string | null;
    saving: boolean;
    saveError: string | null;
    lastSavedAt: string | null;
    lastCommitSha: string | null;
    pendingChange: PendingChange | null;
    composition: Composition | null;
    selectedSectionId: string | null;
    chatMessages: ChatTurn[];
    chatBusy: boolean;
    chatError: string | null;
    chatProgress: string | null;
    chatJob: GenerationJobStatus | null;
    // Set by the editor shell when the job it was watching fell back to a template instead
    // of generating. Survives loadProject on purpose: it is set before the load and it is
    // the first thing the person needs to read when the load finishes.
    generationNotice: string | null;
    projectName: string | null;
    contentSchema: ContentSchema | null;
    content: ContentValues;
    contentIssues: Record<string, string>;
    contentSyncing: boolean;
    contentError: string | null;
    siteMeta: SiteMeta;
    formEndpoint: string | null;
    settingsSaving: boolean;
    settingsError: string | null;
    history: Commit[];
    historyLoading: boolean;
    historyError: string | null;
    restoringSha: string | null;
    setGenerationNotice: (text: string | null) => void;
    setProjectName: (name: string) => void;
    loadProject: (projectId: string) => Promise<void>;
    openFile: (path: string) => void;
    writeActive: (content: string) => void;
    toggleAdvanced: () => void;
    refresh: () => void;
    createFile: (path: string) => PathError | null;
    renameFile: (from: string, to: string) => PathError | null;
    deleteFile: (path: string) => void;
    saveProject: (options?: { commit?: boolean }) => Promise<void>;
    flushPendingSave: () => void;
    proposeChange: (proposed: ProposedChange) => void;
    acceptChange: () => void;
    rejectChange: () => void;
    loadComposition: (composition: Composition) => void;
    selectSection: (id: string) => void;
    requestAiEdit: (instruction: string) => Promise<void>;
    cancelAiEdit: () => void;
    moveSectionUp: (id: string) => void;
    moveSectionDown: (id: string) => void;
    toggleSectionVisible: (id: string) => void;
    toggleSectionLocked: (id: string) => void;
    setSectionVariant: (id: string, variant: string) => void;
    restyleComposition: (art: Partial<ArtDirection>) => void;
    setContentValue: (path: string, value: unknown) => void;
    setListItemValue: (path: string, index: number, key: string, value: unknown) => void;
    addListItem: (path: string) => void;
    removeListItem: (path: string, index: number) => void;
    moveListItem: (path: string, index: number, direction: 'up' | 'down') => void;
    flushContentSync: () => void;
    saveSettings: (patch: PatchProjectRequest) => Promise<void>;
    loadHistory: () => Promise<void>;
    restoreTo: (sha: string) => Promise<void>;
}

/** The page the content panel edits — the project's entry HTML, not whatever tab is open. */
function entryPath(vfs: VFS): string | null {
    return pickEntryFile(vfs.paths().filter((p) => /\.html?$/i.test(p))) ?? pickEntryFile(vfs.paths());
}

function listAt(content: ContentValues, path: string): ListItem[] {
    const [sectionKey, fieldKey] = path.split('.');
    const value = content[sectionKey]?.[fieldKey];
    return Array.isArray(value) ? (value as ListItem[]) : [];
}

function applyComposition(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    change: (composition: Composition) => Composition,
) {
    const { vfs, composition, selectedSectionId } = get();
    if (!composition) return;

    const next = change(composition);
    const stillSelected = next.sections.some((section) => section.id === selectedSectionId);
    set({
        composition: next,
        selectedSectionId: stillSelected ? selectedSectionId : next.sections[0]?.id ?? null,
    });
    writeCompositionFiles(vfs, next);
    autosave.trigger();
}

export const useEditorStore = create<EditorState>((set, get) => ({
    vfs,
    projectId: null,
    tree: vfs.list(),
    activeFile: null,
    dirtyPaths: [],
    advanced: false,
    loading: true,
    loadError: null,
    saving: false,
    saveError: null,
    lastSavedAt: null,
    lastCommitSha: null,
    pendingChange: null,
    composition: null,
    selectedSectionId: null,
    chatMessages: [],
    chatBusy: false,
    chatError: null,
    chatProgress: null,
    chatJob: null,
    generationNotice: null,
    projectName: null,
    contentSchema: null,
    content: {},
    contentIssues: {},
    contentSyncing: false,
    contentError: null,
    siteMeta: {},
    formEndpoint: null,
    settingsSaving: false,
    settingsError: null,
    history: [],
    historyLoading: false,
    historyError: null,
    restoringSha: null,

    setGenerationNotice: (text) => set({ generationNotice: text }),

    setProjectName: (name) => set({ projectName: name }),

    loadProject: async (projectId) => {
        autosave.cancel();
        contentSync.cancel();
        pendingOps.clear();
        set({
            loading: true,
            loadError: null,
            saveError: null,
            pendingChange: null,
            composition: null,
            selectedSectionId: null,
            chatMessages: [],
            chatBusy: false,
            chatError: null,
            chatProgress: null,
            chatJob: null,
            contentError: null,
            contentIssues: {},
            content: {},
            contentSchema: null,
            history: [],
            historyError: null,
            projectId,
        });

        // The tree and the row are independent reads, so they go together. The tree is what
        // the editor cannot open without; the row carries the schema the panel needs, and a
        // project whose design has been retired still opens in the code view.
        const [{ files, updatedAt, error }, { detail, error: detailError }] = await Promise.all([
            loadProjectFiles(projectId),
            loadProjectDetail(projectId),
        ]);

        if (error) {
            set({ loading: false, loadError: error });
            return;
        }

        const { vfs } = get();
        vfs.reset();
        vfs.seed(files);

        const schema = detail ? asContentSchema(detail.contentSchema) : null;
        const entry = entryPath(vfs);
        const html = entry ? vfs.read(entry) : null;

        let composition: Composition | null = null;
        const stored = vfs.read('composition.json');
        if (stored) {
            try {
                composition = parseStoredComposition(stored);
                vfs.write('composition.json', JSON.stringify(composition, null, 2));
            } catch {
                composition = parseComposition(stored);
            }
        }

        // "Your facts are on this design" was printed whenever the design had sections. It
        // was never a claim the code had checked, and on a fallback it was flatly untrue --
        // the facts were not on it, because generation had failed and a stock template had
        // been dropped in. A notice set by the shell beats it, and says so.
        const notice = get().generationNotice;
        const opening = notice
            ? notice
            : schema && schema.sections.length > 0 && !composition
              ? 'Your facts are on this design. Ask for a change, or pick a suggestion.'
              : '';

        set({
            activeFile: pickEntryFile(vfs.paths()),
            lastSavedAt: updatedAt,
            loading: false,
            composition,
            selectedSectionId: composition?.sections[0]?.id ?? null,
            projectName: detail?.name ?? null,
            contentSchema: schema,
            content:
                schema && html !== null
                    ? mergeContent(readContentFromHtml(html, schema), detail?.contentJson ?? {})
                    : {},
            siteMeta: detail?.siteMeta ?? {},
            formEndpoint: detail?.formEndpoint ?? null,
            chatMessages: opening ? [{ role: 'assistant', text: opening }] : [],
            // A project that opens but whose settings did not is worth saying; it is not
            // worth refusing to open over.
            contentError: detailError,
        });
    },

    openFile: (path) => {
        autosave.flush();
        set({ activeFile: path });
    },

    writeActive: (content) => {
        const { vfs, activeFile } = get();
        if (activeFile) vfs.write(activeFile, content);
        if (activeFile === 'composition.json') {
            const parsed = parseComposition(content);
            if (parsed) {
                const selected = get().selectedSectionId;
                const still = parsed.sections.some((section) => section.id === selected);
                set({
                    composition: parsed,
                    selectedSectionId: still ? selected : parsed.sections[0]?.id ?? null,
                });
                writeRenderedSite(vfs, parsed);
            }
        }
        autosave.trigger();
    },

    toggleAdvanced: () => {
        autosave.flush();
        set((s) => ({ advanced: !s.advanced }));
    },

    refresh: () => set({ tree: vfs.list(), dirtyPaths: vfs.dirtyPaths() }),

    createFile: (path) => {
        const { vfs } = get();
        const err = validatePath(path, vfs.paths());
        if (err) return err;
        const clean = path.trim();
        vfs.write(clean, '');
        set({ activeFile: clean });
        autosave.flush();
        return null;
    },

    renameFile: (from, to) => {
        const { vfs, activeFile } = get();
        const err = validatePath(to, vfs.paths().filter((p) => p !== from));
        if (err) return err;
        const clean = to.trim();
        vfs.rename(from, clean);
        if (activeFile === from) set({ activeFile: clean });
        autosave.flush();
        return null;
    },

    deleteFile: (path) => {
        const { vfs, activeFile } = get();
        vfs.delete(path);
        if (activeFile === path) set({ activeFile: vfs.paths()[0] ?? null });
        autosave.flush();
    },

    saveProject: async (options) => {
        const { vfs, projectId, saving, dirtyPaths } = get();

        if (saving || !projectId || dirtyPaths.length === 0) return;

        set({ saving: true, saveError: null });

        const { updatedAt, error } = await saveProjectFiles(projectId, vfs.toMap());

        if (error) {
            set({ saving: false, saveError: error });
            return;
        }

        vfs.markClean();
        set({ saving: false, lastSavedAt: updatedAt });

        if (options?.commit) {
            const { sha } = await createCommit(projectId, 'Saved changes');
            if (sha) set({ lastCommitSha: sha });
        }
    },

    flushPendingSave: () => {
        contentSync.flush();
        autosave.flush();
    },

    proposeChange: (proposed) => {
        const { vfs } = get();
        const before = vfs.read(proposed.path) ?? '';

        const compared = compareText(before, proposed.after);
        const hasExtra = Boolean(
            proposed.extraFiles &&
                Object.keys(proposed.extraFiles).some((p) => p !== proposed.path),
        );
        if (compared.isEmpty && !hasExtra) return;

        set({
            pendingChange: {
                path: proposed.path,
                before,
                after: proposed.after,
                explanation: proposed.explanation,
                ...(proposed.extraFiles ? { extraFiles: proposed.extraFiles } : {}),
            },
            activeFile: proposed.path,
        });
    },

    acceptChange: () => {
        const { vfs, pendingChange } = get();
        if (!pendingChange) return;

        vfs.write(pendingChange.path, pendingChange.after);
        if (pendingChange.extraFiles) {
            for (const [path, content] of Object.entries(pendingChange.extraFiles)) {
                if (path === pendingChange.path) continue;
                vfs.write(path, content);
            }
        }

        if (pendingChange.path === 'composition.json') {
            const parsed = parseComposition(pendingChange.after);
            if (parsed) {
                const selected = get().selectedSectionId;
                const still = parsed.sections.some((section) => section.id === selected);
                set({
                    composition: parsed,
                    selectedSectionId: still ? selected : parsed.sections[0]?.id ?? null,
                });
                writeCompositionFiles(vfs, parsed);
            }
        } else if (/\.html?$/i.test(pendingChange.path)) {
            const schema = get().contentSchema;
            if (schema) {
                set({
                    content: mergeContent(
                        readContentFromHtml(pendingChange.after, schema),
                        get().content,
                    ),
                });
            }
        }

        set({ pendingChange: null });
        autosave.trigger();
    },

    rejectChange: () => set({ pendingChange: null }),

    loadComposition: (composition) => {
        const { vfs } = get();
        set({
            composition,
            selectedSectionId: composition.sections[0]?.id ?? null,
        });
        writeCompositionFiles(vfs, composition);
    },
    selectSection: (id) => set({ selectedSectionId: id }),
    cancelAiEdit: () => {
        chatEpoch += 1;
        set({ chatBusy: false, chatProgress: null, chatJob: null });
    },
    requestAiEdit: async (instruction) => {
        const text = instruction.trim();
        const {
            chatBusy,
            pendingChange,
            composition,
            selectedSectionId,
            projectId,
            vfs,
            chatMessages,
        } = get();

        if (chatBusy) return;
        if (!text) {
            set({ chatError: 'Write what you would like to change.' });
            return;
        }
        if (pendingChange) {
            set({ chatError: 'Review the current suggestion first.' });
            return;
        }
        if (!projectId) {
            set({ chatError: 'This project could not be found.' });
            return;
        }

        const entry = entryPath(vfs);
        const entryHtml = entry ? vfs.read(entry) : null;
        const offTopic = offTopicWebsiteAsk(text);
        if (offTopic) {
            set({ chatError: offTopic });
            return;
        }

        const blocked = styleUpgradeFirewall({
            instruction: text,
            html: entryHtml,
            composition,
        });
        if (blocked) {
            set({ chatError: blocked });
            return;
        }

        const { contentSchema, siteMeta, projectName } = get();
        const sectionCount = composition?.sections.length ?? 0;
        const hasContentPage = Boolean(contentSchema?.sections.length);
        const crossBlocked = crossVerticalFirewall({
            instruction: text,
            vertical: composition?.vertical,
            sectionCount,
            hasContentPage,
            contextText: [
                composition?.meta.title,
                siteMeta?.title,
                projectName,
                entryHtml?.slice(0, 4000),
            ]
                .filter(Boolean)
                .join(' '),
        });
        if (crossBlocked) {
            set({ chatError: crossBlocked });
            return;
        }
        const htmlSite = Boolean(contentSchema?.sections.length) && sectionCount === 0;

        if (isSiteGenerationRequest(text, sectionCount)) {
            if (text.length > MAX_CLASSIFY_CHARS) {
                set({ chatError: 'Keep the request under 500 characters.' });
                return;
            }
            await requestFullSite(get, set, text);
            return;
        }

        // Whole-site rename before code edits — deterministic, no LLM.
        if (composition && composition.sections.length > 0) {
            const rename = parseRenameIntent(text, composition.meta.title);
            if (rename) {
                await requestSiteRename(get, set, text, rename.from, rename.to);
                return;
            }
        }

        // Prefer live HTML/CSS code for every website change Ask can make.
        if (shouldUsePageEdit(text, { hasEntryHtml: Boolean(entryHtml?.trim()) })) {
            if (text.length > 300) {
                set({ chatError: 'Keep the request under 300 characters.' });
                return;
            }
            await requestPageEdit(get, set, text);
            return;
        }
        if (htmlSite) {
            if (text.length > 300) {
                set({ chatError: 'Keep the request under 300 characters.' });
                return;
            }
            await requestCopyRewrite(get, set, text);
            return;
        }

        if (text.length > 300) {
            set({ chatError: 'Keep the request under 300 characters.' });
            return;
        }
        if (!composition || composition.sections.length === 0) {
            if (entryHtml?.trim()) {
                await requestPageEdit(get, set, text);
                return;
            }
            set({ chatError: 'Describe the website you want, or pick a section to change.' });
            return;
        }

        const section =
            composition.sections.find((item) => item.id === selectedSectionId) ??
            composition.sections.find((item) => !item.locked) ??
            null;

        if (!section) {
            if (entryHtml?.trim()) {
                await requestPageEdit(get, set, text);
                return;
            }
            set({ chatError: 'Pick a section first.' });
            return;
        }
        if (section.locked) {
            set({ chatError: 'That section is locked. Unlock it to suggest a change.' });
            return;
        }

        const epoch = ++chatEpoch;
        set({
            chatBusy: true,
            chatError: null,
            chatMessages: [...chatMessages, { role: 'user', text }],
        });

        autosave.cancel();
        await get().saveProject();
        if (epoch !== chatEpoch) return;

        const { sha, error: commitError } = await createCommit(
            projectId,
            'Saved before a suggested change',
        );
        if (epoch !== chatEpoch) return;
        if (sha) set({ lastCommitSha: sha });
        if (!sha) {
            set({
                chatBusy: false,
                chatError: commitError ?? 'Could not save a version first. Try again.',
            });
            return;
        }

        const variants = sectionVariants(section.type);
        const { proposal, error } = await proposeProjectEdit(projectId, {
            instruction: text,
            section: {
                id: section.id,
                type: section.type,
                variant: section.variant || variants[0] || 'default',
                brief: section.brief,
                props: section.props,
            },
        });
        if (epoch !== chatEpoch) return;

        if (error || !proposal) {
            // Section props cannot express layout — fall through to the HTML page editor.
            if (entryHtml?.trim()) {
                set({ chatBusy: false });
                await requestPageEdit(get, set, text, { skipUserBubble: true });
                return;
            }
            set({
                chatBusy: false,
                chatError: error ?? 'The suggestion could not be prepared. Try again.',
            });
            return;
        }

        const next = applyEditPatch(composition, proposal.targetSectionId, proposal.patch);
        if (vfs.read('composition.json') === null) {
            vfs.write('composition.json', JSON.stringify(composition, null, 2));
        }

        const explanation =
            sanitise(proposal.explanation).clean || 'A change is ready to review.';

        get().proposeChange({
            path: 'composition.json',
            after: JSON.stringify(next, null, 2),
            explanation,
        });

        set({
            chatBusy: false,
            chatMessages: [
                ...get().chatMessages,
                { role: 'assistant', text: explanation },
            ],
        });
    },
    moveSectionUp: (id) => applyComposition(get, set, (c) => reorderSection(c, id, 'up')),
    moveSectionDown: (id) => applyComposition(get, set, (c) => reorderSection(c, id, 'down')),
    toggleSectionVisible: (id) => applyComposition(get, set, (c) => toggleVisible(c, id)),
    toggleSectionLocked: (id) => applyComposition(get, set, (c) => toggleLocked(c, id)),
    setSectionVariant: (id, variant) => applyComposition(get, set, (c) => changeVariant(c, id, variant)),
    restyleComposition: (art) => applyComposition(get, set, (c) => restyle(c, art)),

    setContentValue: (path, value) => writeContent(get, set, path, value),

    setListItemValue: (path, index, key, value) => {
        const items = listAt(get().content, path).map((item, i) =>
            i === index ? { ...item, [key]: value } : item,
        );
        writeContent(get, set, path, items);
    },

    addListItem: (path) => {
        const { contentSchema } = get();
        const field = contentSchema ? fieldAt(contentSchema, path) : undefined;
        if (!field || field.type !== 'list') return;
        writeContent(get, set, path, [...listAt(get().content, path), emptyListItem(field)]);
    },

    removeListItem: (path, index) => {
        const items = listAt(get().content, path).filter((_, i) => i !== index);
        writeContent(get, set, path, items);
    },

    moveListItem: (path, index, direction) => {
        const items = [...listAt(get().content, path)];
        const swapWith = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || index >= items.length || swapWith < 0 || swapWith >= items.length) return;
        [items[index], items[swapWith]] = [items[swapWith], items[index]];
        writeContent(get, set, path, items);
    },

    flushContentSync: () => contentSync.flush(),

    saveSettings: async (patch) => {
        const { projectId, settingsSaving } = get();
        if (!projectId || settingsSaving) return;

        set({ settingsSaving: true, settingsError: null });
        const { detail, error } = await saveProjectSettings(projectId, patch);

        if (error || !detail) {
            set({ settingsSaving: false, settingsError: error });
            return;
        }

        set({
            settingsSaving: false,
            projectName: detail.name,
            siteMeta: detail.siteMeta,
            formEndpoint: detail.formEndpoint,
        });

        applySettings(get, detail.siteMeta, detail.formEndpoint);
    },

    loadHistory: async () => {
        const { projectId } = get();
        if (!projectId) return;

        set({ historyLoading: true, historyError: null });
        const { items, error } = await loadCommits(projectId);
        set({ historyLoading: false, history: items, historyError: error });
    },

    /**
     * Go back to a chosen version (V-1, FR-075).
     *
     * Unsaved work goes first, so restoring cannot quietly discard it, and the tree is then
     * re-read from the server rather than patched locally — the server is what actually
     * decided what the project now contains.
     */
    restoreTo: async (sha) => {
        const { projectId, restoringSha } = get();
        if (!projectId || restoringSha) return;

        contentSync.flush();
        await get().saveProject();

        set({ restoringSha: sha, historyError: null });
        const { error } = await restoreVersion(projectId, sha);

        if (error) {
            set({ restoringSha: null, historyError: error });
            return;
        }

        await get().loadProject(projectId);
        set({ restoringSha: null });
        await get().loadHistory();
    },
}));

/** Deterministic whole-site rename — no LLM, so it cannot return the generic internal error. */
async function requestSiteRename(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    text: string,
    from: string,
    to: string,
) {
    const { projectId, chatMessages, composition, vfs } = get();
    if (!projectId || !composition) return;

    const epoch = ++chatEpoch;
    set({
        chatBusy: true,
        chatError: null,
        chatProgress: 'Updating the name across the site…',
        chatMessages: [...chatMessages, { role: 'user', text }],
    });

    autosave.cancel();
    await get().saveProject();
    if (epoch !== chatEpoch) return;

    const { sha, error: commitError } = await createCommit(
        projectId,
        'Saved before renaming the site',
    );
    if (epoch !== chatEpoch) return;
    if (sha) set({ lastCommitSha: sha });
    if (!sha) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: commitError ?? 'Could not save a version first. Try again.',
        });
        return;
    }

    const { next, hits } = renameComposition(composition, from, to);
    const explanation = renameExplanation(from, to, hits);

    if (hits <= 0) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: explanation,
            chatMessages: [...get().chatMessages, { role: 'assistant', text: explanation }],
        });
        return;
    }

    if (vfs.read('composition.json') === null) {
        vfs.write('composition.json', JSON.stringify(composition, null, 2));
    }

    get().proposeChange({
        path: 'composition.json',
        after: JSON.stringify(next, null, 2),
        explanation,
    });

    set({
        chatBusy: false,
        chatProgress: null,
        chatMessages: [...get().chatMessages, { role: 'assistant', text: explanation }],
    });
}

async function requestCopyRewrite(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    text: string,
) {
    const { projectId, chatMessages } = get();
    if (!projectId) return;

    const epoch = ++chatEpoch;
    set({
        chatBusy: true,
        chatError: null,
        chatProgress: 'Rewriting the words…',
        chatMessages: [...chatMessages, { role: 'user', text }],
    });

    autosave.cancel();
    await get().saveProject();
    if (epoch !== chatEpoch) return;

    const { sha, error: commitError } = await createCommit(
        projectId,
        'Saved before a suggested change',
    );
    if (epoch !== chatEpoch) return;
    if (sha) set({ lastCommitSha: sha });
    if (!sha) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: commitError ?? 'Could not save a version first. Try again.',
        });
        return;
    }

    const { proposal, error } = await proposeCopyEdit(projectId, text);
    if (epoch !== chatEpoch) return;

    if (error || !proposal) {
        // Copy path cannot move layout — try the page editor with the same ask.
        const entry = entryPath(get().vfs);
        if (entry && get().vfs.read(entry)?.trim()) {
            set({ chatBusy: false, chatProgress: null });
            await requestPageEdit(get, set, text, { skipUserBubble: true });
            return;
        }
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: error ?? 'The suggestion could not be prepared. Try again.',
        });
        return;
    }

    get().proposeChange({
        path: proposal.path,
        after: proposal.after,
        explanation: proposal.explanation,
    });

    set({
        chatBusy: false,
        chatProgress: null,
        chatMessages: [
            ...get().chatMessages,
            { role: 'assistant', text: proposal.explanation },
        ],
    });
}

async function requestPageEdit(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    text: string,
    opts: { skipUserBubble?: boolean } = {},
) {
    const { projectId, chatMessages } = get();
    if (!projectId) return;

    const epoch = ++chatEpoch;
    set({
        chatBusy: true,
        chatError: null,
        chatProgress: 'Updating the page…',
        chatMessages: opts.skipUserBubble
            ? chatMessages
            : [...chatMessages, { role: 'user', text }],
    });

    autosave.cancel();
    await get().saveProject();
    if (epoch !== chatEpoch) return;

    const { sha, error: commitError } = await createCommit(
        projectId,
        'Saved before a suggested change',
    );
    if (epoch !== chatEpoch) return;
    if (sha) set({ lastCommitSha: sha });
    if (!sha) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: commitError ?? 'Could not save a version first. Try again.',
        });
        return;
    }

    const { proposal, error } = await proposePageEdit(projectId, text, get().activeFile);
    if (epoch !== chatEpoch) return;

    if (error || !proposal) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatError: error ?? 'The suggestion could not be prepared. Try again.',
        });
        return;
    }

    get().proposeChange({
        path: proposal.path,
        after: proposal.after,
        explanation: proposal.explanation,
        ...(proposal.files ? { extraFiles: proposal.files } : {}),
    });

    set({
        chatBusy: false,
        chatProgress: null,
        chatMessages: [
            ...get().chatMessages,
            { role: 'assistant', text: proposal.explanation },
        ],
    });
}

/** One-page generation from Ask. The result is a suggestion until Keep. */
async function requestFullSite(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    text: string,
) {
    const { projectId, chatMessages, composition } = get();
    if (!projectId) return;

    const epoch = ++chatEpoch;
    set({
        chatBusy: true,
        chatError: null,
        chatProgress: 'Preparing your site…',
        chatJob: { status: 'queued', sections_done: 0, sections_total: 0, files_ready: false, elapsed_ms: 0 },
        chatMessages: [...chatMessages, { role: 'user', text }],
    });

    autosave.cancel();
    await get().saveProject();
    if (epoch !== chatEpoch) return;

    const { sha } = await createCommit(projectId, 'Saved before generating a site');
    if (epoch !== chatEpoch) return;
    if (sha) set({ lastCommitSha: sha });

    const { composition: next, error } = await generateSiteProposal(
        projectId,
        text,
        (message, job) => {
            if (epoch !== chatEpoch) return;
            set({ chatProgress: message, chatJob: job });
        },
    );
    if (epoch !== chatEpoch) return;

    if (error || !next) {
        set({
            chatBusy: false,
            chatProgress: null,
            chatJob: null,
            chatError: error ?? 'The site could not be generated.',
        });
        return;
    }

    const replacing = (composition?.sections.length ?? 0) > 0;
    const explanation = generationExplanation(next, replacing);

    get().proposeChange({
        path: 'composition.json',
        after: JSON.stringify(next, null, 2),
        explanation,
    });

    set({
        chatBusy: false,
        chatProgress: null,
        chatJob: null,
        chatMessages: [
            ...get().chatMessages,
            { role: 'assistant', text: explanation },
        ],
    });
}

/**
 * One content edit, all the way through: validated, held in state, written into the page so
 * the preview redraws, and queued for `content_json`.
 *
 * An invalid value is kept in state and marked, never written. The person keeps seeing what
 * they typed and reads why it is refused, and the page they are building stays correct.
 */
function writeContent(
    get: () => EditorState,
    set: (partial: Partial<EditorState>) => void,
    path: string,
    value: unknown,
) {
    const { vfs, contentSchema, content, contentIssues } = get();
    if (!contentSchema) return;

    const field = fieldAt(contentSchema, path);
    if (!field) return;

    const [sectionKey, fieldKey] = path.split('.');
    const nextContent: ContentValues = {
        ...content,
        [sectionKey]: { ...(content[sectionKey] ?? {}), [fieldKey]: value },
    };

    const issue = validateFieldValue(field, value);
    const nextIssues = { ...contentIssues };
    if (issue) nextIssues[path] = issue;
    else delete nextIssues[path];

    set({ content: nextContent, contentIssues: nextIssues });
    if (issue) return;

    const entry = entryPath(vfs);
    const html = entry ? vfs.read(entry) : null;
    if (entry && html !== null) {
        const next = applySlotValue(html, contentSchema, path, value);
        if (next !== html) {
            vfs.write(entry, next);
            autosave.trigger();
        }
    }

    pendingOps.set(path, value);
    contentSync.trigger();
}

/** Site settings into the page, the same way a content edit lands (S-2, S-3, S-4). */
function applySettings(get: () => EditorState, meta: SiteMeta, formEndpoint: string | null) {
    const { vfs, projectName } = get();
    const map = vfs.toMap();
    const withPay = meta.upiId
        ? wireOrderPayments(map, {
            businessName: meta.title?.trim() || projectName || 'This shop',
            upiId: meta.upiId,
        })
        : map;

    let touched = false;
    for (const [path, content] of Object.entries(withPay)) {
        if (vfs.read(path) === content) continue;
        vfs.write(path, content);
        touched = true;
    }

    const entry = entryPath(vfs);
    const html = entry ? vfs.read(entry) : null;
    if (entry && html !== null) {
        const next = applySettingsToHtml(html, {
            meta,
            faviconUrl: meta.faviconUrl ?? null,
            ogImageUrl: meta.ogImageUrl ?? null,
            formEndpoint,
        });
        if (next !== html) {
            vfs.write(entry, next);
            touched = true;
        }
    }

    if (touched) autosave.trigger();
}

// Ops waiting for their trip to the server, one per slot: typing a headline twice before the
// timer fires is one op, not two.
const pendingOps = new Map<string, unknown>();

const contentSync = debounceTrigger(() => {
    void flushContentOps();
}, CONTENT_SYNC_DELAY_MS);

async function flushContentOps(): Promise<void> {
    const store = useEditorStore.getState();
    const { projectId } = store;

    if (!projectId || pendingOps.size === 0) return;

    const ops: ContentOp[] = [...pendingOps].map(([path, value]) => ({ path, value }));
    pendingOps.clear();

    useEditorStore.setState({ contentSyncing: true });
    const { error } = await saveProjectContent(projectId, ops);
    useEditorStore.setState({ contentSyncing: false, contentError: error });
}

const autosave = debounceTrigger(() => {
    useEditorStore.getState().saveProject();
}, AUTOSAVE_DELAY_MS);

vfs.subscribe(() => useEditorStore.getState().refresh());
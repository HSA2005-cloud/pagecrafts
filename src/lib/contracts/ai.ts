import type { Category } from '@/lib/contracts/template';

export type { Category };

export const TONE_IDS = ['playful', 'formal', 'minimal', 'bold', 'warm'] as const;
export const PALETTE_IDS = ['light', 'dark', 'colourful', 'muted'] as const;

export type Tone = (typeof TONE_IDS)[number];
export type Palette = (typeof PALETTE_IDS)[number];

export const SECTION_KEYS = [
    'hero', 'about', 'services', 'menu', 'gallery',
    'team', 'testimonials', 'faq', 'contact', 'footer',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const THEME_IDS = [
    'clinical-blue', 'warm-editorial', 'deep-luxury', 'vivid-energy',
    'calm-sage', 'mono-precision', 'sunlit-craft', 'tech-slate',
] as const;

export const MOTION_IDS = [
    'none', 'whisper', 'calm', 'editorial', 'kinetic', 'showcase',
] as const;

export const RADIUS_IDS = ['sharp', 'soft', 'pill', 'organic', 'framed'] as const;
export const SPACING_IDS = ['tight', 'default', 'airy'] as const;
export const IMAGERY_IDS = [
    'bright-clean', 'warm-natural', 'bold-contrast', 'muted-duotone', 'documentary',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type MotionId = (typeof MOTION_IDS)[number];
export type RadiusId = (typeof RADIUS_IDS)[number];
export type SpacingId = (typeof SPACING_IDS)[number];
export type ImageryId = (typeof IMAGERY_IDS)[number];

export interface ArtDirection {
    themeId: ThemeId;
    motionId: MotionId;
    radiusId: RadiusId;
    spacingId: SpacingId;
    imageryId: ImageryId;
}

export interface IntentAttributes {
    category: Category;
    vertical: string;
    tone: Tone;
    palette: Palette;
    sections: SectionKey[];
    fallback: boolean;
}

export interface RecipeEntry {
    type: SectionKey;
    required: boolean;
    note?: string;
}

export interface VerticalProfile {
    slug: string;
    label: string;
    aliases: string[];
    recipe: RecipeEntry[];
    artDirection: ArtDirection;
    vocabulary: Record<string, string>;
    imageQueries: string[];
}

export type SectionProps = Record<string, unknown>;

export interface SectionInstance {
    id: string;
    type: SectionKey;
    variant: string;
    brief: string;
    visible: boolean;
    locked: boolean;
    source: 'ai' | 'user' | 'profile-default';
    props: SectionProps;
}

export interface Composition {
    schemaVersion: number;
    vertical: string;
    artDirection: ArtDirection;
    meta: { title: string; description: string; lang: string };
    sections: SectionInstance[];
}

export interface PatchOp {
    op: 'replace' | 'add' | 'remove';
    path: string;
    value?: unknown;
}

export interface EditProposal {
    targetSectionId: string;
    patch: PatchOp[];
    explanation: string;
    applied: false;
}

export interface FilledSection {
    key: SectionKey;
    props: SectionProps;
}

export interface Usage {
    /** Which provider served the call — Groq and Cerebras host near-identical model names. */
    provider?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    /** Which prompt version produced this output, e.g. `classify.v1`. */
    promptVersion?: string;
    /** How the reply's shape was constrained (json_schema, json_object, …). */
    structuredOutput?: string;
}

export interface AiResult<T> {
    data: T;
    usage: Usage;
}

export const SCHEMA_VERSION = 3;
export const MAX_SECTIONS = 7;
export const MAX_CLASSIFY_CHARS = 2_000;
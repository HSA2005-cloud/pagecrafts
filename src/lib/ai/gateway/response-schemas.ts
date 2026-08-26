import { Type, type Schema } from '@google/genai';
import {
    SECTION_KEYS, THEME_IDS, MOTION_IDS, RADIUS_IDS, SPACING_IDS, IMAGERY_IDS,
    TONE_IDS, PALETTE_IDS,
} from '@/lib/contracts';
import { SECTION_CONTRACTS } from '../sections/contracts';
import { CATEGORIES } from '../schemas';

const TONES = [...TONE_IDS];
const PALETTES = [...PALETTE_IDS];

export const classifySchema: Schema = {
    type: Type.OBJECT,
    properties: {
        category: { type: Type.STRING, enum: [...CATEGORIES] },
        vertical: { type: Type.STRING },
        tone: { type: Type.STRING, enum: TONES },
        palette: { type: Type.STRING, enum: PALETTES },
        sections: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...SECTION_KEYS] } },
    },
    required: ['category', 'vertical', 'tone', 'palette', 'sections'],
    propertyOrdering: ['category', 'vertical', 'tone', 'palette', 'sections'],
};

export const profileSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        label: { type: Type.STRING },
        aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
        artDirection: {
            type: Type.OBJECT,
            properties: {
                themeId: { type: Type.STRING, enum: [...THEME_IDS] },
                motionId: { type: Type.STRING, enum: [...MOTION_IDS] },
                radiusId: { type: Type.STRING, enum: [...RADIUS_IDS] },
                spacingId: { type: Type.STRING, enum: [...SPACING_IDS] },
                imageryId: { type: Type.STRING, enum: [...IMAGERY_IDS] },
            },
            required: ['themeId', 'motionId', 'radiusId', 'spacingId', 'imageryId'],
        },
        recipe: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: [...SECTION_KEYS] },
                    required: { type: Type.BOOLEAN },
                    note: { type: Type.STRING },
                },
                required: ['type', 'required'],
                propertyOrdering: ['type', 'required', 'note'],
            },
        },
        vocabulary: {
            type: Type.OBJECT,
            properties: { customer: { type: Type.STRING }, purchase: { type: Type.STRING } },
            required: ['customer', 'purchase'],
        },
        imageQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['label', 'aliases', 'artDirection', 'recipe', 'vocabulary', 'imageQueries'],
    propertyOrdering: ['label', 'aliases', 'artDirection', 'recipe', 'vocabulary', 'imageQueries'],
};

const ALL_VARIANTS = [...new Set(
    Object.values(SECTION_CONTRACTS).flatMap((c) => c.variants),
)];

export const planSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        sections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: [...SECTION_KEYS] },
                    variant: { type: Type.STRING, enum: ALL_VARIANTS },
                    brief: { type: Type.STRING },
                },
                required: ['type', 'variant', 'brief'],
                propertyOrdering: ['type', 'variant', 'brief'],
            },
        },
    },
    required: ['sections'],
};
/** Freeform multi-file site (custom / heavy builds). */
export const composeSiteSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        files: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    path: { type: Type.STRING },
                    content: { type: Type.STRING },
                },
                required: ['path', 'content'],
                propertyOrdering: ['path', 'content'],
            },
        },
    },
    required: ['title', 'description', 'files'],
    propertyOrdering: ['title', 'description', 'files'],
};

/**
 * The shape Ask has to answer an edit in.
 *
 * proposeEdit sent no schema at all, alone among the stages, so nothing put response_format
 * on the request and a model free to reply in prose sometimes did. JSON.parse threw a
 * SyntaxError nothing caught and the editor showed "we could not finish that just now".
 *
 * `changes` is a bag of section fields whose names depend on the section being edited, so it
 * cannot be enumerated here the way classify's enums are. Declaring it an object is enough
 * to make the reply JSON; editProposal in contracts checks the rest.
 */
export const editProposalSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        changes: { type: Type.OBJECT },
        explanation: { type: Type.STRING },
    },
    required: ['changes', 'explanation'],
    propertyOrdering: ['changes', 'explanation'],
};

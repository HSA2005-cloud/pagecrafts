export type MotionMotifId =
    | 'jalebi'
    | 'tooth'
    | 'leaf'
    | 'scale'
    | 'note'
    | 'paw'
    | 'flame'
    | 'needle'
    | 'wheel'
    | 'building'
    | 'crate'
    | 'cap'
    | 'heart'
    | 'steam'
    | 'flower'
    | 'bolt'
    | 'coin'
    | 'drape'
    | 'none';

function blob(vertical: string, extra: string): string {
    return `${vertical.replace(/[-_]/g, ' ')} ${extra}`.toLowerCase();
}

function escapeText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Pick a decorative motif from the business, not a generic kinetic overlay. */
export function motifFor(vertical: string, extra = ''): MotionMotifId {
    const t = blob(vertical, extra);
    if (/\b(sweet|mithai|halwai|jalebi|ladoo|laddu|barfi|dessert|bakery|pastry|confection)/.test(t)
        || /sweetshop/.test(t)) return 'jalebi';
    if (/\b(dental|dentist|tooth|teeth|orthodont)/.test(t)) return 'tooth';
    if (/\b(yoga|ayurved|plant|garden|florist)\b/.test(t)) return 'leaf';
    if (/\b(law|legal|advocate|attorney|court)\b/.test(t)) return 'scale';
    if (/\b(music|piano|guitar|choir)\b/.test(t)) return 'note';
    if (/\b(vet|veterinary|pet|dog|cat|animal)\b/.test(t)) return 'paw';
    if (/\b(gym|fitness|workout|personal.?trainer)\b/.test(t)) return 'flame';
    if (/\b(driv(ing|er)|motor.?school|car.?repair|mechanic|garage)\b/.test(t)) return 'wheel';
    if (/\b(architect|architecture|real.?estate|interior)\b/.test(t)) return 'building';
    if (/\b(logistics|courier|freight|packers?|movers?|shipping)\b/.test(t)) return 'crate';
    if (/\b(university|universities|college|tuition|coaching)\b/.test(t)) return 'cap';
    if (/\b(ngo|charit|nonprofit|non profit|donate|volunteer)/.test(t)) return 'heart';
    // No motif on a restaurant. The steam glyph sat as a large translucent line drawing over
    // the hero photograph, and on a plate of food it read as a smudge on the lens rather than
    // as decoration — the one place the picture is already doing the work.
    //
    // The rule is kept rather than deleted so the reason survives: 'steam' is still a motif
    // the renderer knows how to draw, and a food business that genuinely wants one can be
    // routed back here. Nothing else changes for the other verticals.
    if (/\b(saree|sari|clothing|fashion|boutique|textile|tailor)\b/.test(t)) return 'drape';
    if (/\b(wedding|bridal|marriage)\b/.test(t)) return 'flower';
    if (/\b(electric|electrician|wiring)\b/.test(t)) return 'bolt';
    if (/\b(accountants?|accounting|chartered|bookkeep)/.test(t)) return 'coin';
    if (/\b(clinic|hospital|doctor|physio|nurse)/.test(t)) return 'needle';
    return 'none';
}

function svg(id: string, inner: string, extraClass = ''): string {
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `<svg${cls} viewBox="0 0 120 120" width="560" height="560" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="1"/>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0.45"/>
        </linearGradient>
        <filter id="${id}-glow" x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="2.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${inner}
    </svg>`;
}

function sparks(): string {
    return [0, 1, 2, 3].map((i) => `<span class="motif-spark" style="--s:${i}"></span>`).join('');
}

function markup(id: MotionMotifId, body: string): string {
    return `<div class="motion-motif" data-motif="${id}" aria-hidden="true"><span class="motif-halo"></span>${body}${sparks()}</div>`;
}

/** Aurora, perspective grid, floating 3D glass cards and grain — the kinetic canvas behind the motif. */
export function motionStageMarkup(): string {
    const card = (variant: string) =>
        `<div class="motion-float-card motion-float-card-${variant}">`
        + `<div class="dot-row"><span class="dot"></span><span class="dot dot-b"></span><span class="dot dot-c"></span></div>`
        + `<span class="bar bar-wide"></span><span class="bar bar-narrow"></span>`
        + `</div>`;

    return `<div class="motion-stage" aria-hidden="true"><span class="motion-aurora"></span><span class="motion-grid"></span><span class="motion-grain"></span><span class="motion-flare"></span><div class="motion-float-cards">${card('a')}${card('b')}</div></div>`;
}

/** Oversized ghost type that marquee-scrolls through the hero. */
export function motionTickerMarkup(title: string): string {
    const beat = escapeText(title.trim() || 'Studio');
    const line = Array.from({ length: 8 }, () => beat).join('  ·  ');
    return `<div class="motion-ticker" aria-hidden="true"><p>${line}  ·  ${line}</p></div>`;
}

/** Inline SVG for the animated look — one motif, tied to this vertical. */
export function motionMotifMarkup(vertical: string, extra = ''): string {
    const id = motifFor(vertical, extra);
    switch (id) {
        case 'jalebi':
            return markup(id, [
                svg('jalebi', `<path class="jalebi-coil" d="M62 14c22 1 40 16 40 36 0 22-20 38-42 38-18 0-32-11-32-24 0-11 10-19 22-19 10 0 18 6 18 13 0 6-5 10-12 10-5 0-8-3-8-6 0-3 2-5 6-5" fill="none" stroke="url(#jalebi-g)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#jalebi-glow)"/>`, 'motif-body'),
                svg('jalebi2', `<path d="M62 14c22 1 40 16 40 36 0 22-20 38-42 38-18 0-32-11-32-24 0-11 10-19 22-19 10 0 18 6 18 13 0 6-5 10-12 10-5 0-8-3-8-6 0-3 2-5 6-5" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>`, 'motif-ghost'),
                `<span class="honey-drip" style="--d:0s"></span>`,
                `<span class="honey-drip honey-drip-b" style="--d:0.7s"></span>`,
                `<span class="honey-drip honey-drip-c" style="--d:1.3s"></span>`,
            ].join(''));
        case 'tooth':
            return markup(id, svg('tooth',
                `<g class="motif-body" filter="url(#tooth-glow)" fill="url(#tooth-g)">
                   <path d="M38 28c0-10 8-18 22-18s22 8 22 18c0 5-1.2 10-1.2 16 0 11 4 24-6 30-4 2.4-7-3.2-10.5-3.2S57 74.4 53 72c-10-6-6.8-19-6.8-30 0-6-1.2-11-1.2-16z"/>
                   <path d="M52 34c6-8 16-8 22 0" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round"/>
                 </g>`,
            ));
        case 'leaf':
            return markup(id, svg('leaf',
                `<g class="motif-body" filter="url(#leaf-glow)" fill="url(#leaf-g)">
                   <path d="M28 86c8-34 28-54 62-66-6 36-24 58-62 66z"/>
                   <path d="M36 78c18-16 34-40 50-58" fill="none" stroke="currentColor" stroke-width="3"/>
                 </g>`,
            ));
        case 'scale':
            return markup(id, svg('scale',
                `<g class="motif-body" fill="none" stroke="url(#scale-g)" stroke-width="4" stroke-linecap="round" filter="url(#scale-glow)">
                   <path d="M60 18v72M32 96h56"/>
                   <path d="M60 28l-28 22h56L60 28z"/>
                   <path d="M32 50l-10 18h20zm56 0l-10 18h20z"/>
                 </g>`,
            ));
        case 'note':
            return markup(id, svg('note',
                `<g class="motif-body" fill="url(#note-g)" filter="url(#note-glow)">
                   <ellipse cx="38" cy="86" rx="14" ry="10"/>
                   <rect x="48" y="28" width="6" height="58" rx="2"/>
                   <path d="M54 28c18 4 28 8 32 20v12c-10-8-22-12-32-14z"/>
                   <ellipse cx="78" cy="72" rx="10" ry="7" opacity="0.7"/>
                 </g>`,
            ));
        case 'paw':
            return markup(id, svg('paw',
                `<g class="motif-body" fill="url(#paw-g)" filter="url(#paw-glow)">
                   <circle cx="36" cy="38" r="11"/>
                   <circle cx="60" cy="28" r="12"/>
                   <circle cx="86" cy="38" r="11"/>
                   <ellipse cx="60" cy="78" rx="24" ry="20"/>
                 </g>`,
            ));
        case 'flame':
            return markup(id, svg('flame',
                `<path class="motif-body" filter="url(#flame-glow)" fill="url(#flame-g)" d="M60 12s28 24 28 52a28 28 0 1 1-56 0c0-16 16-32 28-52z"/>`,
            ));
        case 'needle':
            return markup(id, svg('needle',
                `<g class="motif-body" fill="none" stroke="url(#needle-g)" stroke-width="4" stroke-linecap="round" filter="url(#needle-glow)">
                   <path d="M28 92L92 28"/>
                   <circle cx="96" cy="24" r="8"/>
                   <path d="M22 98h16"/>
                 </g>`,
            ));
        case 'wheel':
            return markup(id, svg('wheel',
                `<g class="motif-body" fill="none" stroke="url(#wheel-g)" stroke-width="4.5" filter="url(#wheel-glow)">
                   <circle cx="60" cy="60" r="34"/>
                   <circle cx="60" cy="60" r="10"/>
                   <path d="M60 26v16M60 78v16M26 60h16M78 60h16M36 36l12 12M72 72l12 12M84 36L72 48M48 72L36 84"/>
                 </g>`,
            ));
        case 'building':
            return markup(id, svg('building',
                `<g class="motif-body" filter="url(#building-glow)">
                   <rect x="24" y="36" width="72" height="64" rx="2" fill="url(#building-g)"/>
                   <rect x="48" y="16" width="24" height="20" fill="currentColor"/>
                   <g fill="#06040c" opacity="0.55">
                     <rect x="34" y="48" width="14" height="14"/>
                     <rect x="72" y="48" width="14" height="14"/>
                     <rect x="34" y="72" width="14" height="14"/>
                     <rect x="72" y="72" width="14" height="14"/>
                   </g>
                 </g>`,
            ));
        case 'crate':
            return markup(id, svg('crate',
                `<g class="motif-body" fill="none" stroke="url(#crate-g)" stroke-width="4.5" filter="url(#crate-glow)">
                   <rect x="22" y="40" width="76" height="52" rx="4"/>
                   <path d="M22 40l38-18 38 18M60 22v70"/>
                 </g>`,
            ));
        case 'cap':
            return markup(id, svg('cap',
                `<g class="motif-body" fill="url(#cap-g)" filter="url(#cap-glow)">
                   <path d="M12 56l48-24 48 24-48 18z"/>
                   <rect x="54" y="70" width="12" height="22" rx="1"/>
                   <path d="M92 60v20c0 10-32 16-32 16"/>
                 </g>`,
            ));
        case 'heart':
            return markup(id, svg('heart',
                `<path class="motif-body" filter="url(#heart-glow)" fill="url(#heart-g)" d="M60 98S16 74 16 46c0-14 10-24 24-24 8 0 14 5 20 12 6-7 12-12 20-12 14 0 24 10 24 24 0 28-44 52-44 52z"/>`,
            ));
        case 'steam':
            return markup(id, svg('steam',
                `<g class="motif-body" fill="none" stroke="url(#steam-g)" stroke-width="4.5" stroke-linecap="round" filter="url(#steam-glow)">
                   <path d="M40 88c0-18 14-18 14-36"/>
                   <path d="M60 92c0-22 14-22 14-44"/>
                   <path d="M80 88c0-18 14-18 14-36"/>
                   <ellipse cx="60" cy="100" rx="34" ry="8"/>
                 </g>`,
            ));
        case 'flower':
            return markup(id, svg('flower',
                `<g class="motif-body" fill="url(#flower-g)" filter="url(#flower-glow)">
                   <circle cx="60" cy="60" r="12"/>
                   <ellipse cx="60" cy="28" rx="14" ry="22"/>
                   <ellipse cx="60" cy="92" rx="14" ry="22"/>
                   <ellipse cx="28" cy="60" rx="22" ry="14"/>
                   <ellipse cx="92" cy="60" rx="22" ry="14"/>
                 </g>`,
            ));
        case 'bolt':
            return markup(id, svg('bolt',
                `<path class="motif-body" filter="url(#bolt-glow)" fill="url(#bolt-g)" d="M70 8L28 62h26l-8 50 48-62H68l8-42z"/>`,
            ));
        case 'coin':
            return markup(id, svg('coin',
                `<g class="motif-body" fill="none" stroke="url(#coin-g)" stroke-width="4.5" filter="url(#coin-glow)">
                   <circle cx="60" cy="60" r="34"/>
                   <circle cx="60" cy="60" r="26"/>
                   <path d="M60 38v44M46 50h18c8 0 8 10 0 10H50c-8 0-8 10 0 10h22"/>
                 </g>`,
            ));
        case 'drape':
            return markup(id, svg('drape',
                `<path class="motif-body" filter="url(#drape-glow)" fill="url(#drape-g)" d="M22 14h76c-4 28-4 56 0 92H22c4-36 4-64 0-92z"/>`,
            ));
        default:
            return '';
    }
}

'use client';

import {
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
    useCallback,
    useRef,
    useState,
} from 'react';

const DEFAULT_LEFT = 30;
const MIN_LEFT = 18;
const MAX_LEFT = 55;
const STEP = 2;

export default function EditorSplit({
    left,
    right,
}: {
    left: ReactNode;
    right: ReactNode;
}) {
    const [leftPct, setLeftPct] = useState(DEFAULT_LEFT);
    const [dragging, setDragging] = useState(false);
    const frame = useRef<HTMLDivElement>(null);

    const clamp = useCallback((pct: number) => Math.min(MAX_LEFT, Math.max(MIN_LEFT, pct)), []);

    const moveTo = useCallback(
        (clientX: number) => {
            const box = frame.current?.getBoundingClientRect();
            if (!box || box.width <= 0) return;
            setLeftPct(clamp(((clientX - box.left) / box.width) * 100));
        },
        [clamp],
    );

    function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        moveTo(e.clientX);
    }

    function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        moveTo(e.clientX);
    }

    function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setDragging(false);
    }

    function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setLeftPct((pct) => clamp(pct - STEP));
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setLeftPct((pct) => clamp(pct + STEP));
        } else if (e.key === 'Home') {
            e.preventDefault();
            setLeftPct(MIN_LEFT);
        } else if (e.key === 'End') {
            e.preventDefault();
            setLeftPct(MAX_LEFT);
        }
    }

    return (
        <div
            ref={frame}
            className={`relative flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row ${dragging ? 'select-none' : ''}`}
            style={{ '--editor-left': `${leftPct}%` } as CSSProperties}
        >
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:h-full lg:w-[var(--editor-left)] lg:flex-none lg:overflow-hidden">
                {left}
            </section>
            <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize chat and preview"
                aria-valuemin={MIN_LEFT}
                aria-valuemax={MAX_LEFT}
                aria-valuenow={Math.round(leftPct)}
                aria-valuetext={`${Math.round(leftPct)} percent chat, ${Math.round(100 - leftPct)} percent preview`}
                title="Drag to resize. Double-click to reset."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => setLeftPct(DEFAULT_LEFT)}
                onKeyDown={onKeyDown}
                className="group relative z-10 hidden w-3 shrink-0 cursor-col-resize touch-none items-stretch justify-center bg-transparent focus-visible:outline-none lg:flex"
            >
                <span
                    className="w-px self-stretch bg-border transition-colors group-hover:bg-bloom-sky group-focus-visible:bg-bloom-sky group-active:bg-bloom-sky"
                    aria-hidden
                />
            </button>
            <section
                className={`relative min-h-0 min-w-0 flex-1 border-t border-border/60 lg:border-t-0 ${dragging ? 'pointer-events-none' : ''}`}
            >
                {right}
            </section>
        </div>
    );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils";

interface SpeechRec {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((event: SpeechRecEvent) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
}

interface SpeechRecEvent {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>>;
}

function speechEngine(): (new () => SpeechRec) | null {
    if (typeof window === "undefined") return null;
    const w = window as Window & {
        SpeechRecognition?: new () => SpeechRec;
        webkitSpeechRecognition?: new () => SpeechRec;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function DictationButton({
    onTranscript,
    label,
    disabled,
    className,
}: {
    onTranscript: (text: string) => void;
    label: string;
    disabled?: boolean;
    className?: string;
}) {
    const recRef = useRef<SpeechRec | null>(null);
    const [listening, setListening] = useState(false);
    const supported = useSyncExternalStore(
        () => () => {},
        () => Boolean(speechEngine()),
        () => false,
    );

    useEffect(() => {
        return () => recRef.current?.stop();
    }, []);

    if (!supported) return null;

    function toggle() {
        if (listening) {
            recRef.current?.stop();
            return;
        }
        const Engine = speechEngine();
        if (!Engine) return;
        const rec = new Engine();
        rec.lang = "en-IN";
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (event) => {
            const bits: string[] = [];
            for (let i = 0; i < event.results.length; i += 1) {
                const row = event.results[i];
                const spoken = row?.[0]?.transcript?.trim();
                if (spoken) bits.push(spoken);
            }
            const chunk = bits.join(" ").trim();
            if (chunk) onTranscript(chunk);
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        recRef.current = rec;
        try {
            rec.start();
            setListening(true);
        } catch {
            setListening(false);
        }
    }

    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : label}
            title={listening ? "Stop listening" : label}
            onClick={toggle}
            className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                listening
                    ? "bg-gold text-gold-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                className,
            )}
        >
            {listening ? <Square className="size-3.5" /> : <Mic className="size-4" />}
        </button>
    );
}

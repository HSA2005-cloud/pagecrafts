import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    PROMPT_PHRASES,
    currentPhrase,
    initialTypewriter,
    promptQuery,
    stepTypewriter,
    typedPrompt,
    type TypewriterState,
} from "@/lib/hero-prompt";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("hero prompt phrases", () => {
    it("are site ideas in the product voice, not a slogan", () => {
        const joined = PROMPT_PHRASES.join(" | ").toLowerCase();
        expect(joined).toContain("bakery");
        expect(joined).toContain("clinic");
        expect(joined).toContain("gym");
        expect(joined).not.toContain("no templates");
        expect(joined).not.toContain("one-page site");
        expect(PROMPT_PHRASES.length).toBeGreaterThanOrEqual(3);
    });

    it("types, holds, deletes, then types the next phrase", () => {
        const phrases = ["ab", "cd"] as const;
        let state = initialTypewriter();
        expect(typedPrompt(state, phrases)).toBe("");
        expect(state.phase).toBe("type");

        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("a");
        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("ab");
        state = stepTypewriter(state, phrases);
        expect(state.phase).toBe("hold");

        state = stepTypewriter(state, phrases);
        expect(state.phase).toBe("delete");

        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("a");
        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("");
        state = stepTypewriter(state, phrases);
        expect(state.phase).toBe("type");
        expect(currentPhrase(state, phrases)).toBe("cd");

        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("c");
        state = stepTypewriter(state, phrases);
        expect(typedPrompt(state, phrases)).toBe("cd");
        state = stepTypewriter(state, phrases);
        expect(state.phase).toBe("hold");
    });

    it("wraps from the last phrase back to the first", () => {
        const phrases = ["a", "b"] as const;
        let state: TypewriterState = { index: 1, length: 0, phase: "delete" };
        state = stepTypewriter(state, phrases);
        expect(state).toEqual({ index: 0, length: 0, phase: "type" });
        expect(currentPhrase(state, phrases)).toBe("a");
    });

    it("submits what they typed, or the current phrase if the field is empty", () => {
        expect(promptQuery("  a gym  ", "a clinic in Pune")).toBe("a gym");
        expect(promptQuery("   ", "a bakery with ordering")).toBe("a bakery with ordering");
        expect(promptQuery("", "a clinic in Pune", 8)).toBe("a clinic");
    });
});

describe("the prompt bar is shared", () => {
    it("loops on the landing hero and the signed-in Welcome slide", () => {
        const prompt = read("src", "components", "landing", "HeroPrompt.tsx");
        const typewriter = read("src", "components", "landing", "prompt-typewriter.tsx");
        const graphic = read("src", "components", "deck", "WelcomePrompt.tsx");
        const welcome = read("src", "components", "deck", "WelcomeSlide.tsx");
        const hero = read("src", "components", "landing", "Hero.tsx");

        expect(typewriter).toContain("stepTypewriter");
        expect(typewriter).toContain("prefers-reduced-motion");
        expect(typewriter).toContain("hero-prompt-caret");
        expect(graphic).toContain("useTypewriterLoop");
        expect(graphic).toContain('href="#build"');
        expect(graphic).toContain("welcome-prompt-cta");
        expect(graphic).toContain("Build it →");
        expect(graphic).not.toMatch(/<input|<textarea|contentEditable|contenteditable/);

        const css = read("src", "app", "globals.css");
        const cta = css.slice(css.indexOf(".welcome-prompt-cta {"), css.indexOf(".welcome-prompt-cta:hover"));
        expect(cta).toContain("font-weight: 700");
        expect(cta).toContain("var(--gold)");
        expect(cta).toContain("var(--gold-foreground)");
        expect(cta).not.toContain("var(--signal)");
        expect(cta).not.toContain("var(--bloom-amber)");
        expect(cta).not.toContain("var(--bloom-blue)");
        expect(cta).not.toMatch(/#[0-9a-fA-F]{3,8}/);
        expect(css).toContain(".welcome-prompt-cta:hover");
        expect(css).toContain("transform: scale(1.045)");
        const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(reduce).toContain(".welcome-prompt-cta:hover");
        expect(reduce).toContain("transform: none");
        expect(graphic).not.toContain("/new?q=");
        expect(prompt).toContain("/new?q=");
        expect(prompt).not.toContain("Build it");
        expect(prompt).not.toMatch(/<button/);
        expect(hero).toContain("<HeroPrompt />");
        const artwork = read("src", "components", "landing", "HeroArtwork.tsx");
        const deck = read("src", "components", "landing", "LandingDeck.tsx");
        expect(artwork).toContain("thumbnailUrl");
        expect(artwork).toContain("object-cover object-top");
        expect(artwork).not.toContain("/landing/");
        expect(deck).toContain("pickLandingHeroTemplates");
        expect(deck).toContain("pickLandingShowcaseTemplates");
        expect(deck).toContain("<HeroArtwork templates={templates} />");
        expect(artwork).not.toContain("hero-pane");
        expect(welcome).toContain("<WelcomePrompt />");
        expect(welcome).not.toContain("HeroPrompt");
        expect(welcome).not.toMatch(/<input|<textarea|contentEditable|contenteditable/);

        const promptAt = welcome.indexOf("<WelcomePrompt />");
        const helloAt = welcome.indexOf("Hello,");
        const liveAt = welcome.indexOf("<LiveBar />");
        expect(helloAt).toBeGreaterThan(-1);
        expect(promptAt).toBeGreaterThan(helloAt);
        expect(liveAt).toBeGreaterThan(promptAt);

        expect(welcome).not.toContain("Start building");
        expect(welcome).not.toContain('href="#how-it-works"');
        expect(welcome).not.toContain("How it works");
        expect(welcome).not.toContain("no templates");
        expect(welcome).toContain("Pick a design");
        expect(welcome).toContain("edit in place");
        expect(welcome).toContain("Rs 249");
        expect(welcome).toContain("text-[3.5rem]");
        expect(welcome).toContain("text-lg");
    });
});

describe("the public header", () => {
    it("puts Sign in and Sign up next to each other, on their own pages", () => {
        const header = read("src", "components", "landing", "SiteHeader.tsx");
        const css = read("src", "app", "globals.css");
        const signin = read("src", "app", "(auth)", "signin", "page.tsx");
        const signup = read("src", "app", "(auth)", "signup", "page.tsx");
        expect(header).toContain("<BrandMark");
        expect(header).not.toContain("01 —");
        expect(header).not.toContain("02 —");
        expect(header).toContain('href="/signin"');
        expect(header).toContain('href="/signup"');
        expect(header).toContain("Sign in");
        expect(header).toContain("Sign up");
        expect(header).toContain("sign-in-quiet");
        expect(header).toContain("sign-in-cta");
        expect(css).toContain(".sign-in-cta");
        expect(css).toContain("var(--gold)");
        expect(css).toContain("--gold: #c4a86a");
        const cta = css.slice(css.indexOf(".sign-in-cta {"), css.indexOf(".sign-in-cta:hover"));
        expect(cta).not.toContain("var(--signal)");
        expect(cta).not.toContain("var(--bloom-amber)");
        expect(cta).not.toMatch(/#[0-9a-fA-F]{3,8}/);
        expect(signin).toContain('initialMode="signin"');
        expect(signin).not.toContain('initialMode="signup"');
        expect(signup).toContain('initialMode="signup"');
        expect(signup).toContain("Start");
        expect(signup).not.toContain("Welcome");
    });
});

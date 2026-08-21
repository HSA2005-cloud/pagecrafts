import { MAX_CLASSIFY_CHARS } from "@/lib/contracts";
import { intentParams } from "@/lib/discovery/ranking";
import { parseTemplateQuery, queryTemplates, type TemplateQuery } from "@/lib/templates/query";
import { DEFAULT_SORT } from "@/lib/discovery/sort";
import { FilterChips } from "@/components/discovery/FilterChips";
import { GalleryGrid } from "@/components/discovery/GalleryGrid";
import { GalleryError } from "@/components/discovery/GalleryStates";
import { PromptEcho } from "@/components/discovery/PromptEcho";
import { supabaseViewerClient } from "@/lib/auth/server";
import { getStoredPlan } from "@/lib/data/plan";
import type { PlanId } from "@/lib/plans/catalog";

type Params = Record<string, string | string[] | undefined>;

function toPrompt(value: string | undefined): string | undefined {
    const text = value?.trim().slice(0, MAX_CLASSIFY_CHARS);
    return text ? text : undefined;
}

function searchParamsOf(params: Params): URLSearchParams {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string" && key !== "error" && key !== "slide") {
            search.set(key, value);
        }
    }
    return search;
}

/**
 * The params the query layer gets, which are not quite the params in the address bar.
 *
 * `q` means two different things on the two sides of this line, and conflating them breaks
 * the funnel. In the URL it is the sentence the person typed on the describe screen — it is
 * echoed back to them and turned into a ranking, and it is explicitly not a filter (D5). To
 * GET /templates it is a text search over a design's name, description and tags.
 *
 * Feeding the first into the second filters the library by every word of a sentence:
 * "a small online shop" left exactly one design on screen where thirteen belonged. So the
 * description is dropped here, and the gallery's own search box — which arrives with the
 * filter chips at D7 — will travel as `search`.
 */
function queryParamsOf(search: URLSearchParams): URLSearchParams {
    const forQuery = new URLSearchParams(search);
    forQuery.delete("q");

    const text = search.get("search");
    if (text) forQuery.set("q", text);

    return forQuery;
}

export async function TemplatesSlide({ params }: { params: Params }) {
    const search = searchParamsOf(params);
    const query = parseTemplateQuery(queryParamsOf(search));
    const prompt = toPrompt(typeof params.q === "string" ? params.q : undefined);

    // The viewer's plan decides which tiles read as locked. Read once here and thread down.
    let plan: PlanId = "starter";
    try {
        plan = await getStoredPlan(await supabaseViewerClient());
    } catch {
        plan = "starter";
    }

    return (
        <div>
            <header data-reveal className="flex flex-col gap-3">
                <h1
                    id="templates-heading"
                    className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                >
                    {prompt ? "Here are designs for your site" : "Choose a design"}
                </h1>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    {prompt
                        ? "Closest matches first. Choose a design you love — you can customize it in the next step."
                        : "Every design is free to edit — you only pay when you go live."}
                </p>
                {prompt && (
                    <PromptEcho
                        text={prompt}
                        editHref={`/new?${new URLSearchParams({
                            ...(query.category ? { category: query.category } : {}),
                            q: prompt,
                        }).toString()}`}
                    />
                )}
            </header>

            <div className="mt-8 flex flex-col gap-8">
                <Gallery query={query} prompt={prompt} search={search} plan={plan} />
            </div>
        </div>
    );
}

async function Gallery({
    query,
    prompt,
    search,
    plan,
}: {
    query: TemplateQuery;
    prompt: string | undefined;
    search: URLSearchParams;
    plan: PlanId;
}) {
    let result;
    try {
        result = await Promise.resolve(queryTemplates(query));
    } catch (error) {
        console.error("[gallery] could not read the library", error);
        return <GalleryError retryHref={`/templates?${search.toString()}`} />;
    }

    const preserve: Record<string, string> = {
        ...(query.category ? { category: query.category } : {}),
        ...(query.colour ? { colour: query.colour } : {}),
        ...(query.layout ? { layout: query.layout } : {}),
        ...(query.feature ? { feature: query.feature } : {}),
        ...(query.tier ? { tier: query.tier } : {}),
        ...(prompt ? { q: prompt } : {}),
        ...(query.q ? { search: query.q } : {}),
        ...intentParams(query.intent),
    };

    const chipPreserve: Record<string, string> = {
        ...preserve,
        ...(query.sort !== DEFAULT_SORT ? { sort: query.sort } : {}),
    };

    return (
        <>
            <FilterChips query={query} preserve={chipPreserve} resetHref="/templates" />
            <GalleryGrid
                templates={result.items}
                total={result.total}
                activeCategory={query.category}
                sort={query.sort}
                preserve={preserve}
                personalised={Boolean(prompt || query.category || query.intent)}
                resetHref="/templates"
                ranked={query.sort === "recommended" && Boolean(query.intent)}
                plan={plan}
            />
        </>
    );
}

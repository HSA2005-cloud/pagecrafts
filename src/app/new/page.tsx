import { Sparkles } from "lucide-react";

import { MAX_CLASSIFY_CHARS } from "@/lib/contracts";
import { toCategory } from "@/lib/discovery/categories";
import { IntentCapture } from "@/components/discovery/IntentCapture";
import { PagecraftFeatures } from "@/components/discovery/PagecraftFeatures";
import { TEMPLATES } from "@/lib/templates";
import { templateUuid } from "@/lib/templates/template-id";

function designFor(templateId: string | undefined) {
  if (!templateId) return null;
  return TEMPLATES.find((template) => templateUuid(template.id) === templateId) ?? null;
}

// Screen 03 — facts first. Arriving with `template` means they already picked a design;
// we ask the same questions, then write those answers onto that layout.
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; template?: string }>;
}) {
  const { q, category, template } = await searchParams;
  const design = designFor(template);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-10 pt-4">
      <header data-reveal className="flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden
          className="brand-halo flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-accent/60 text-primary"
        >
          <Sparkles className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Tell us about the <span className="text-primary">business</span>
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          {design
            ? `Name, place, and what they do — we put those facts on ${design.name} and add About, Contact and Settings.`
            : "A one-liner is not enough. Name, place, and what they do — then AI writes every page from those facts."}
        </p>
        {design && design.tier !== "free" ? (
          <p className="text-xs text-muted-foreground">
            This design is paid. You will be asked to pay once before it is set up.
          </p>
        ) : null}
      </header>

      <IntentCapture
        initialDescribe={q?.slice(0, MAX_CLASSIFY_CHARS) ?? ""}
        initialCategory={toCategory(category) ?? null}
        library={!design}
        sourceTemplateId={design ? templateUuid(design.id) : template ?? null}
      />

      {design ? null : <PagecraftFeatures />}
    </main>
  );
}

import { Globe, Smartphone, Sparkles, TrendingUp, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The "what you get" strip beneath the describe screen — reassurance, not a control. Static
// by design: it makes no promises the funnel has to keep on this screen.
interface Feature {
    icon: LucideIcon;
    title: string;
    body: string;
}

const FEATURES: Feature[] = [
    { icon: Sparkles, title: "AI Website Builder", body: "Generate a complete website in seconds." },
    { icon: Wand2, title: "Customizable Design", body: "Easily customize colors, fonts, and layouts." },
    { icon: Smartphone, title: "Mobile Responsive", body: "Your site will look perfect on all devices." },
    { icon: TrendingUp, title: "SEO Ready", body: "Built-in SEO tools to help you rank higher." },
    { icon: Globe, title: "Publish Anywhere", body: "Connect your domain and go live with one click." },
];

export function PagecraftFeatures() {
    return (
        <section data-reveal className="glass-panel rounded-2xl p-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
                What can you do with PageCrafts?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
                Our AI-powered platform helps you create professional websites in minutes.
            </p>

            <ul className="mt-6 grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-3">
                        <Icon
                            aria-hidden
                            className="mt-0.5 size-5 shrink-0 text-primary"
                            strokeWidth={1.75}
                        />
                        <span className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-foreground">{title}</span>
                            <span className="text-xs leading-5 text-muted-foreground">{body}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const COLOR_TOKENS = [
  { name: "background", className: "bg-background border border-border" },
  { name: "foreground", className: "bg-foreground" },
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "muted", className: "bg-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "destructive", className: "bg-destructive" },
  { name: "border", className: "bg-border" },
  { name: "field", className: "bg-field border border-input" },
  { name: "gold", className: "bg-gold" },
  { name: "brand gradient", className: "brand-gradient" },
] as const;

const RADII = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          PageCrafts design system
        </h1>
        <p className="text-muted-foreground">
          Design tokens and base primitives (R2 · Day 1). Every element here is
          built only from tokens — see{" "}
          <code className="font-mono text-sm">docs/design-tokens.md</code>.
        </p>
      </header>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className="flex flex-col gap-2">
              <div className={`h-16 w-full rounded-md ${token.className}`} />
              <span className="font-mono text-xs text-muted-foreground">
                {token.name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-1">
          <p className="text-3xl font-semibold tracking-tight">Display</p>
          <p className="text-xl font-medium">Heading</p>
          <p className="text-base">Body — the quick brown fox jumps.</p>
          <p className="text-sm text-muted-foreground">Muted small print.</p>
          <p className="font-mono text-sm">mono — const x = 1;</p>
        </div>
      </Section>

      <Section title="Radii">
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-2">
              <div
                className={`size-16 border border-border bg-secondary ${r.className}`}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {r.name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="brand">Brand</Button>
          <Button variant="outline-brand">Outline brand</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="xl">Extra large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Input">
        <div className="flex max-w-sm flex-col gap-3">
          <Input placeholder="you@example.com" />
          <Input inputSize="lg" placeholder="you@example.com — large" />
        </div>
      </Section>

      <Section title="Chips / badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="secondary">Free</Badge>
          <Badge variant="accent">Premium · Rs 499</Badge>
          <Badge>Signature · Rs 999</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Aurora</CardTitle>
            <CardDescription>Clean one-page portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Free</Badge>
          </CardContent>
          <CardFooter>
            <Button variant="brand" className="w-full">Use this design</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set up your site</DialogTitle>
              <DialogDescription>
                A themed dialog primitive, built on the same tokens.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Continue</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
    </main>
  );
}

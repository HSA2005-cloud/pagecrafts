import { viewer } from "@/lib/auth/session";
import { FlowSteps } from "@/components/app/FlowSteps";
import { SiteHeader } from "@/components/landing/SiteHeader";

export default async function ChooseLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await viewer();

    return (
        <>
            <SiteHeader user={user} />
            <div className="flex min-h-0 flex-1 flex-col pt-16">
                <div className="flex shrink-0 justify-center border-b border-border/40 px-6 py-3">
                    <FlowSteps current={2} />
                </div>
                <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </div>
        </>
    );
}

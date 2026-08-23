import { viewer } from "@/lib/auth/session";
import { AppSidebar } from "@/components/app/AppSidebar";

// The product shell around the User Plans screen. Signed out is fine to reach the page, but
// upgrading needs an account (the API refuses anonymously).
export default async function PlansLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await viewer();

    return (
        <div className="flex min-h-screen flex-1">
            <AppSidebar user={user} activeHref="/plans" className="hidden lg:flex" />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
    );
}

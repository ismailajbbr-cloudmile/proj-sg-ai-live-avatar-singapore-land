import type { ReactNode } from "react";

type Props = {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
};

export function AdminPageHeader({ title, description, actions }: Props) {
    return (
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-[#0a2240]">{title}</h1>
                {description != null && (
                    <div className="mt-1 text-sm text-gray-500">{description}</div>
                )}
            </div>
            {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

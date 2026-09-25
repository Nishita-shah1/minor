import { Clock3 } from "lucide-react";

type ComingSoonPageProps = {
  label: string;
  title: string;
  description: string;
  panelDescription: string;
};

export function ComingSoonPage({
  label,
  title,
  description,
  panelDescription,
}: ComingSoonPageProps) {
  return (
    <section className="flex min-h-[calc(100svh-4rem)] flex-col px-5 pt-2 pb-8 sm:px-8 lg:px-14 xl:px-20">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
        <div className="inline-flex w-fit items-center rounded-full border-2 border-black bg-card px-4 py-1.5 text-xs font-bold tracking-[0.18em] uppercase shadow-sm">
          EchoLeaks workspace
        </div>

        <div className="mt-5 max-w-5xl sm:mt-6">
          <p className="mb-3 text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">
            {label}
          </p>
          <h1 className="font-head text-[clamp(3.25rem,8vw,7.5rem)] leading-[0.86] tracking-[-0.06em]">
            <span className="relative isolate inline-block">
              <span className="relative z-10">{title}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-[0.02em] -z-10 h-[0.25em] bg-primary text-primary-foreground dark:bg-primary/25"
              />
            </span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {description}
          </p>
        </div>

        <div className="mt-10 flex flex-1 items-start sm:mt-14">
          <div className="w-full rounded-xl border-2 border-black bg-card p-6 shadow-lg sm:p-8 lg:p-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-black bg-primary text-primary-foreground shadow-sm">
                <Clock3 aria-hidden="true" className="size-6" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="font-head text-2xl tracking-tight sm:text-3xl">
                  Coming soon
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {panelDescription}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

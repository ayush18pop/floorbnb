import type { ReactNode } from "react";
import { Xh } from "@/components/ui/xh";
import { Reveal } from "@/components/ui/reveal";

/** A page section: 1px top rule across the frame, crosshairs where the rule meets the rails. */
export function Section({
  id,
  index,
  label,
  title,
  intro,
  children,
}: {
  id: string;
  index: string;
  label: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} className="sec" aria-labelledby={`${id}-h`}>
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <Reveal className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12">
        <div className="col-span-4 md:col-span-8 lg:col-span-5 pad pt-12 md:pt-16">
          <p className="label mb-4">{index} / {label}</p>
          <h2 id={`${id}-h`} className="h1">{title}</h2>
        </div>
        {intro && <div className="col-span-4 md:col-span-8 lg:col-span-6 lg:col-start-7 pad lg:pt-16 flex items-end">{typeof intro === "string" ? <p className="body-l">{intro}</p> : intro}</div>}
      </Reveal>
      <Reveal>{children}</Reveal>
    </section>
  );
}

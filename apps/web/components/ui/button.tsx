import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const cls = (v: Variant, extra = "") => `btn btn-${v} ${extra}`.trim();

export function ButtonLink({
  variant = "secondary",
  href,
  children,
  className,
  ...rest
}: { variant?: Variant; href: string; children: ReactNode } & Omit<ComponentProps<"a">, "href">) {
  const external = /^https?:/.test(href);
  if (external)
    return (
      <a href={href} className={cls(variant, className)} {...rest}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls(variant, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "secondary",
  className,
  ...rest
}: { variant?: Variant } & ComponentProps<"button">) {
  return <button type="button" className={cls(variant, className)} {...rest} />;
}

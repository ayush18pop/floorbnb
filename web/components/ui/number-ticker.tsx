"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring } from "motion/react"

/**
 * Magic UI NumberTicker (magicui.design/docs/components/number-ticker), adapted to BRAND.md section 8:
 * - server render and no-JS show the exact final value;
 * - spring tuned to settle in about 600ms;
 * - the exact final value is written when the animation ends;
 * - nothing animates under prefers-reduced-motion.
 */
interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  delay?: number
  decimalPlaces?: number
  /** Shown before the number, e.g. "−" handled by the caller via value sign. */
  prefix?: string
  suffix?: string
}

export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  className,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(startValue)
  const springValue = useSpring(motionValue, { damping: 40, stiffness: 260 })
  const isInView = useInView(ref, { once: true, margin: "0px" })

  const fmt = (n: number) =>
    prefix +
    Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(n) +
    suffix

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // After hydration, park the text at the start value until the element is in view.
  useEffect(() => {
    if (reduced() || !ref.current) return
    ref.current.textContent = fmt(startValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isInView || reduced()) return
    const timer = setTimeout(() => motionValue.set(value), delay * 1000)
    return () => clearTimeout(timer)
  }, [motionValue, isInView, delay, value])

  useEffect(() => {
    const off1 = springValue.on("change", (latest) => {
      if (ref.current && isInView && !reduced()) ref.current.textContent = fmt(latest)
    })
    const off2 = springValue.on("animationComplete", () => {
      if (ref.current && !reduced()) ref.current.textContent = fmt(value)
    })
    return () => {
      off1()
      off2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [springValue, decimalPlaces, value, isInView])

  return (
    <span ref={ref} className={className} {...props}>
      {fmt(value)}
    </span>
  )
}

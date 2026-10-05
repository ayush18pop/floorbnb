/** Never block 0 and never an unbounded span: at or after the deploy block, and within `maxSpan` of the head. */
export function boundedFrom(head: bigint, deploy: bigint, maxSpan: bigint, estimate?: bigint): bigint {
  let from = estimate !== undefined && estimate > deploy ? estimate : deploy;
  if (head - from > maxSpan) from = head - maxSpan;
  return from < deploy ? deploy : from;
}


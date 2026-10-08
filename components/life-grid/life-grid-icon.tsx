import type { SVGProps } from 'react'

/** Menu icon for 人生年曆: a little grid of day squares, a few lit. Inherits currentColor. */
export function LifeGridIcon(props: Omit<SVGProps<SVGSVGElement>, 'children'>) {
  const cells: Array<[number, number, boolean]> = [
    [3, 4, true], [9.5, 4, true], [16, 4, false],
    [3, 10.5, false], [9.5, 10.5, true], [16, 10.5, true],
    [3, 17, true], [9.5, 17, false], [16, 17, false],
  ]
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true" focusable="false" {...props}>
      {cells.map(([x, y, lit], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width="5"
          height="5"
          rx="1.6"
          fill={lit ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={lit ? 0 : 1.4}
          opacity={lit ? 1 : 0.55}
        />
      ))}
    </svg>
  )
}

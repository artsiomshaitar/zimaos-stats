import { formatTooltipTime } from "@/lib/format"

interface Row {
  color: string
  name: string
  value: string
}

export function StatsTooltipFrame({
  tsSec,
  rows,
}: {
  tsSec: number
  rows: Array<Row>
}) {
  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <div className="mb-1.5 text-[11px] text-muted-foreground">
        {formatTooltipTime(tsSec)}
      </div>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="h-0.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="flex-1 truncate text-muted-foreground">
              {row.name}
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

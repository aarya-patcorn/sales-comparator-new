import { CircleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again shortly.",
}: {
  title?: string
  message?: string
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <span className="text-sm text-muted-foreground">{message}</span>
}

export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr key={rowIndex}>
      {Array.from({ length: columns }, (_, cellIndex) => (
        <td key={cellIndex} className="p-4">
          <Skeleton className="h-5 w-full max-w-28" />
        </td>
      ))}
    </tr>
  ))
}

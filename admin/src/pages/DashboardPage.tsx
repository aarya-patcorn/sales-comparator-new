import { ErrorState } from "@/components/PageState"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/features/dashboard/useDashboard"

const summaryLabels = [
  "Total RM users",
  "Active RM users",
  "Total Kamdhenu products",
  "Active Kamdhenu products",
]

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard()

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <ErrorState
          title="Dashboard unavailable"
          message="We couldn’t load the dashboard totals. Please try again shortly."
        />
      </div>
    )
  }

  const summaryValues = data
    ? [
        data.rmUsers.total,
        data.rmUsers.active,
        data.products.total,
        data.products.active,
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeading />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryLabels.map((label, index) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight">
                  {summaryValues[index]}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        A quick view of users and products.
      </p>
    </div>
  )
}

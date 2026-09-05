import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState, TableSkeleton } from "@/components/PageState"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Competitor } from "@/features/competitors/api"

const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, Competitor>()

type CompetitorsTableProps = {
  competitors: Competitor[]
  isLoading: boolean
  isChanging: boolean
  onOpenProducts: (competitor: Competitor) => void
  onEdit: (competitor: Competitor) => void
  onToggleStatus: (competitor: Competitor) => void
  onDelete: (competitor: Competitor) => void
}

export function CompetitorsTable({
  competitors,
  isLoading,
  isChanging,
  onOpenProducts,
  onEdit,
  onToggleStatus,
  onDelete,
}: CompetitorsTableProps) {
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => onOpenProducts(row.original)}
            >
              {row.original.name}
            </Button>
          ),
        }),
        columnHelper.accessor("isActive", {
          header: "Status",
          cell: ({ row }) => (
            <Badge variant={row.original.isActive ? "default" : "secondary"}>
              {row.original.isActive ? "Active" : "Inactive"}
            </Badge>
          ),
        }),
        columnHelper.accessor("productCount", {
          header: "Products",
          cell: ({ row }) => row.original.productCount ?? 0,
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const competitor = row.original
            return (
              <div className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Open row actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onOpenProducts(competitor)}>
                      Manage products
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isChanging} onClick={() => onEdit(competitor)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isChanging}
                      onClick={() => onToggleStatus(competitor)}
                    >
                      {competitor.isActive ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isChanging}
                      onClick={() => onDelete(competitor)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          },
        }),
      ]),
    [isChanging, onDelete, onEdit, onOpenProducts, onToggleStatus],
  )

  const table = useTable({ features, data: competitors, columns })

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton columns={4} />
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                <EmptyState message="No competitors found." />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

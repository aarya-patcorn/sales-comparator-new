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
import type { Product } from "@/features/products/api"

const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, Product>()

type ProductsTableProps = {
  products: Product[]
  isLoading: boolean
  isChanging: boolean
  onEdit: (product: Product) => void
  onToggleStatus: (product: Product) => void
  onDelete: (product: Product) => void
}

export function ProductsTable({
  products,
  isLoading,
  isChanging,
  onEdit,
  onToggleStatus,
  onDelete,
}: ProductsTableProps) {
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("code", { header: "Code" }),
        columnHelper.accessor("name", { header: "Name" }),
        columnHelper.accessor("enClassification", {
          header: "EN classification",
          cell: ({ row }) => row.original.enClassification || "—",
        }),
        columnHelper.accessor("isActive", {
          header: "Status",
          cell: ({ row }) => (
            <Badge variant={row.original.isActive ? "default" : "secondary"}>
              {row.original.isActive ? "Active" : "Inactive"}
            </Badge>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const product = row.original

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
                    <DropdownMenuItem disabled={isChanging} onClick={() => onEdit(product)}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isChanging}
                      onClick={() => onToggleStatus(product)}
                    >
                      {product.isActive ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isChanging}
                      onClick={() => onDelete(product)}
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
    [isChanging, onDelete, onEdit, onToggleStatus],
  )

  const table = useTable({ features, data: products, columns })

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton columns={5} />
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
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                <EmptyState message="No products found." />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

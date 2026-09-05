import { CircleAlert, MoreHorizontal, Plus, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ErrorState, TableSkeleton } from "@/components/PageState"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useCompetitorProducts,
  useCreateCompetitorProduct,
  useDeleteCompetitorProduct,
  useUpdateCompetitorProduct,
  type Competitor,
  type CompetitorProduct,
  type CompetitorProductUpdate,
} from "@/features/competitors/api"
import { CompetitorProductForm } from "@/features/competitors/CompetitorProductForm"

type CompetitorProductsPanelProps = {
  competitor: Competitor
  onClose: () => void
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function CompetitorProductsPanel({
  competitor,
  onClose,
}: CompetitorProductsPanelProps) {
  const productsQuery = useCompetitorProducts(competitor.id)
  const createProduct = useCreateCompetitorProduct()
  const updateProduct = useUpdateCompetitorProduct()
  const deleteProduct = useDeleteCompetitorProduct()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<CompetitorProduct | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<CompetitorProduct | null>(null)

  const isSaving = createProduct.isPending || updateProduct.isPending

  function addProduct() {
    setEditingProduct(null)
    setIsFormOpen(true)
  }

  function editProduct(product: CompetitorProduct) {
    setEditingProduct(product)
    setIsFormOpen(true)
  }

  async function saveProduct(input: CompetitorProductUpdate, file?: File) {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, input })
        toast.success("Competitor product updated")
      } else {
        await createProduct.mutateAsync({
          input: { ...input, competitorId: competitor.id },
          file,
        })
        toast.success("Competitor product added")
      }
      setIsFormOpen(false)
    } catch (error) {
      toast.error("Could not save competitor product", {
        description: errorMessage(error),
      })
    }
  }

  async function deleteSelectedProduct() {
    if (!deletingProduct) return

    try {
      await deleteProduct.mutateAsync(deletingProduct.id)
      toast.success("Competitor product deleted")
      setDeletingProduct(null)
    } catch (error) {
      toast.error("Could not delete competitor product", {
        description: errorMessage(error),
      })
    }
  }

  const products = productsQuery.data?.competitorProducts ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>{competitor.name} products</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Add products manually or prefill specifications from a TDS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!competitor.isActive} onClick={addProduct}>
            <Plus />
            Add product
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close products" onClick={onClose}>
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!competitor.isActive && (
          <Alert>
            <CircleAlert />
            <AlertTitle>Competitor is inactive</AlertTitle>
            <AlertDescription>
              Activate this competitor before adding another product.
            </AlertDescription>
          </Alert>
        )}

        {productsQuery.isError && (
          <ErrorState
            title="Could not load competitor products"
            message={errorMessage(productsQuery.error)}
          />
        )}

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>EN classification</TableHead>
                <TableHead>Spec source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQuery.isLoading ? (
                <TableSkeleton columns={4} rows={3} />
              ) : products.length ? (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.enClassification || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {product.specSource === "tds_ai" ? "TDS" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Open product actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => editProduct(product)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeletingProduct(product)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No products added for this competitor.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CompetitorProductForm
        open={isFormOpen}
        product={editingProduct}
        isSaving={isSaving}
        onOpenChange={setIsFormOpen}
        onSubmit={saveProduct}
      />

      <ConfirmDialog
        open={deletingProduct !== null}
        title="Delete competitor product?"
        description={`This removes ${deletingProduct?.name || "this product"} from comparisons.`}
        confirmLabel="Delete product"
        isConfirming={deleteProduct.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteProduct.isPending) setDeletingProduct(null)
        }}
        onConfirm={() => void deleteSelectedProduct()}
      />
    </Card>
  )
}

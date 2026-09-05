import { Plus, Search } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ErrorState } from "@/components/PageState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useSetProductStatus,
  useUpdateProduct,
  type Product,
  type ProductInput,
  type ProductStatusFilter,
} from "@/features/products/api"
import { ProductFormDialog } from "@/features/products/ProductFormDialog"
import { ProductsTable } from "@/features/products/ProductsTable"

const PAGE_SIZE = 10

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function ProductsPage() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<ProductStatusFilter>("all")
  const [page, setPage] = useState(1)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)

  const productsQuery = useProducts({ search, status, page, pageSize: PAGE_SIZE })
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const setProductStatus = useSetProductStatus()
  const deleteProduct = useDeleteProduct()

  const products = productsQuery.data?.products ?? []
  const pagination = productsQuery.data?.pagination
  const isSaving = createProduct.isPending || updateProduct.isPending
  const isChanging = isSaving || setProductStatus.isPending || deleteProduct.isPending

  function openCreateDialog() {
    setEditingProduct(null)
    setIsFormOpen(true)
  }

  const openEditDialog = useCallback((product: Product) => {
    setEditingProduct(product)
    setIsFormOpen(true)
  }, [])

  async function saveProduct(input: ProductInput) {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, input })
        toast.success("Product updated")
      } else {
        await createProduct.mutateAsync(input)
        toast.success("Product added")
      }
      setIsFormOpen(false)
    } catch (error) {
      toast.error("Could not save product", {
        description: errorMessage(error),
      })
    }
  }

  const toggleStatus = useCallback(
    async (product: Product) => {
      const nextStatus = !product.isActive
      try {
        await setProductStatus.mutateAsync({
          id: product.id,
          isActive: nextStatus,
        })
        toast.success(`Product ${nextStatus ? "activated" : "deactivated"}`)
      } catch (error) {
        toast.error("Could not change product status", {
          description: errorMessage(error),
        })
      }
    },
    [setProductStatus],
  )

  const openDeleteDialog = useCallback((product: Product) => {
    setDeletingProduct(product)
  }, [])

  async function deleteSelectedProduct() {
    if (!deletingProduct) return

    try {
      await deleteProduct.mutateAsync(deletingProduct.id)
      toast.success("Product deleted")
      setDeletingProduct(null)
      if (products.length === 1 && page > 1) setPage((current) => current - 1)
    } catch (error) {
      toast.error("Could not delete product", {
        description: errorMessage(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage Kamdhenu products and their technical specifications.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus />
          Add product
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            className="pl-9"
            placeholder="Search code, name, or classification"
            aria-label="Search products"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as ProductStatusFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {productsQuery.isError && (
        <ErrorState
          title="Could not load products"
          message={errorMessage(productsQuery.error)}
        />
      )}

      <ProductsTable
        products={products}
        isLoading={productsQuery.isLoading}
        isChanging={isChanging}
        onEdit={openEditDialog}
        onToggleStatus={(product) => void toggleStatus(product)}
        onDelete={openDeleteDialog}
      />

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {pagination
            ? `${pagination.total} product${pagination.total === 1 ? "" : "s"}`
            : "Loading products…"}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || productsQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              !pagination || page >= pagination.totalPages || productsQuery.isFetching
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <ProductFormDialog
        open={isFormOpen}
        product={editingProduct}
        isSaving={isSaving}
        onOpenChange={setIsFormOpen}
        onSubmit={saveProduct}
      />

      <ConfirmDialog
        open={deletingProduct !== null}
        title="Delete product?"
        description={`This removes ${deletingProduct?.name || "this product"} from the catalogue.`}
        confirmLabel="Delete product"
        isConfirming={deleteProduct.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteProduct.isPending) setDeletingProduct(null)
        }}
        onConfirm={() => void deleteSelectedProduct()}
      />
    </div>
  )
}

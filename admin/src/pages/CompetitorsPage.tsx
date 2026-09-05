import { Plus, Search } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ErrorState } from "@/components/PageState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useCompetitors,
  useCreateCompetitor,
  useDeleteCompetitor,
  useSetCompetitorStatus,
  useUpdateCompetitor,
  type Competitor,
  type CompetitorInput,
} from "@/features/competitors/api"
import { CompetitorFormDialog } from "@/features/competitors/CompetitorFormDialog"
import { CompetitorProductsPanel } from "@/features/competitors/CompetitorProductsPanel"
import { CompetitorsTable } from "@/features/competitors/CompetitorsTable"

const PAGE_SIZE = 10

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function CompetitorsPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null)
  const [deletingCompetitor, setDeletingCompetitor] = useState<Competitor | null>(null)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)

  const competitorsQuery = useCompetitors({ search, page, pageSize: PAGE_SIZE })
  const createCompetitor = useCreateCompetitor()
  const updateCompetitor = useUpdateCompetitor()
  const setCompetitorStatus = useSetCompetitorStatus()
  const deleteCompetitor = useDeleteCompetitor()

  const competitors = competitorsQuery.data?.competitors ?? []
  const pagination = competitorsQuery.data?.pagination
  const isSaving = createCompetitor.isPending || updateCompetitor.isPending
  const isChanging =
    isSaving || setCompetitorStatus.isPending || deleteCompetitor.isPending

  function openCreateDialog() {
    setEditingCompetitor(null)
    setIsFormOpen(true)
  }

  const openEditDialog = useCallback((competitor: Competitor) => {
    setEditingCompetitor(competitor)
    setIsFormOpen(true)
  }, [])

  async function saveCompetitor(input: CompetitorInput) {
    try {
      if (editingCompetitor) {
        const result = await updateCompetitor.mutateAsync({
          id: editingCompetitor.id,
          input,
        })
        if (selectedCompetitor?.id === editingCompetitor.id) {
          setSelectedCompetitor(result.competitor)
        }
        toast.success("Competitor updated")
      } else {
        await createCompetitor.mutateAsync(input)
        toast.success("Competitor added")
      }
      setIsFormOpen(false)
    } catch (error) {
      toast.error("Could not save competitor", {
        description: errorMessage(error),
      })
    }
  }

  const toggleStatus = useCallback(
    async (competitor: Competitor) => {
      const nextStatus = !competitor.isActive
      try {
        const result = await setCompetitorStatus.mutateAsync({
          id: competitor.id,
          isActive: nextStatus,
        })
        if (selectedCompetitor?.id === competitor.id) {
          setSelectedCompetitor(result.competitor)
        }
        toast.success(`Competitor ${nextStatus ? "activated" : "deactivated"}`)
      } catch (error) {
        toast.error("Could not change competitor status", {
          description: errorMessage(error),
        })
      }
    },
    [selectedCompetitor, setCompetitorStatus],
  )

  const openDeleteDialog = useCallback((competitor: Competitor) => {
    setDeletingCompetitor(competitor)
  }, [])

  async function deleteSelectedCompetitor() {
    if (!deletingCompetitor) return

    try {
      await deleteCompetitor.mutateAsync(deletingCompetitor.id)
      if (selectedCompetitor?.id === deletingCompetitor.id) {
        setSelectedCompetitor(null)
      }
      toast.success("Competitor deleted")
      setDeletingCompetitor(null)
      if (competitors.length === 1 && page > 1) setPage((current) => current - 1)
    } catch (error) {
      toast.error("Could not delete competitor", {
        description: errorMessage(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <p className="text-sm text-muted-foreground">
            Manage competitors and the products used in comparisons.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus />
          Add competitor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          className="pl-9"
          placeholder="Search name or slug"
          aria-label="Search competitors"
        />
      </div>

      {competitorsQuery.isError && (
        <ErrorState
          title="Could not load competitors"
          message={errorMessage(competitorsQuery.error)}
        />
      )}

      <CompetitorsTable
        competitors={competitors}
        isLoading={competitorsQuery.isLoading}
        isChanging={isChanging}
        onOpenProducts={setSelectedCompetitor}
        onEdit={openEditDialog}
        onToggleStatus={(competitor) => void toggleStatus(competitor)}
        onDelete={openDeleteDialog}
      />

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {pagination
            ? `${pagination.total} competitor${pagination.total === 1 ? "" : "s"}`
            : "Loading competitors…"}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || competitorsQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              !pagination || page >= pagination.totalPages || competitorsQuery.isFetching
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {selectedCompetitor && (
        <CompetitorProductsPanel
          competitor={selectedCompetitor}
          onClose={() => setSelectedCompetitor(null)}
        />
      )}

      <CompetitorFormDialog
        open={isFormOpen}
        competitor={editingCompetitor}
        isSaving={isSaving}
        onOpenChange={setIsFormOpen}
        onSubmit={saveCompetitor}
      />

      <ConfirmDialog
        open={deletingCompetitor !== null}
        title="Delete competitor?"
        description={`This removes ${deletingCompetitor?.name || "this competitor"} and all of its products from comparisons.`}
        confirmLabel="Delete competitor"
        isConfirming={deleteCompetitor.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteCompetitor.isPending) setDeletingCompetitor(null)
        }}
        onConfirm={() => void deleteSelectedCompetitor()}
      />
    </div>
  )
}

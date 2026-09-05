import { Plus, Search } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ErrorState } from "@/components/PageState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useCreateRmUser,
  useDeleteRmUser,
  useRmUsers,
  useSetRmUserStatus,
  useUpdateRmUser,
  type RmUser,
  type RmUserInput,
} from "@/features/rm-users/api"
import { RmUserFormDialog } from "@/features/rm-users/RmUserFormDialog"
import { RmUsersTable } from "@/features/rm-users/RmUsersTable"

const PAGE_SIZE = 10

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function RmUsersPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<RmUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<RmUser | null>(null)

  const usersQuery = useRmUsers({ search, page, pageSize: PAGE_SIZE })
  const createUser = useCreateRmUser()
  const updateUser = useUpdateRmUser()
  const setUserStatus = useSetRmUserStatus()
  const deleteUser = useDeleteRmUser()

  const pagination = usersQuery.data?.pagination
  const users = usersQuery.data?.users ?? []
  const isSaving = createUser.isPending || updateUser.isPending
  const isChanging = isSaving || setUserStatus.isPending || deleteUser.isPending

  function openCreateDialog() {
    setEditingUser(null)
    setIsFormOpen(true)
  }

  const openEditDialog = useCallback((user: RmUser) => {
    setEditingUser(user)
    setIsFormOpen(true)
  }, [])

  async function saveUser(input: RmUserInput) {
    try {
      if (editingUser) {
        await updateUser.mutateAsync({ id: editingUser.id, input })
        toast.success("RM user updated")
      } else {
        await createUser.mutateAsync(input)
        toast.success("RM user added")
      }
      setIsFormOpen(false)
    } catch (error) {
      toast.error("Could not save RM user", {
        description: errorMessage(error),
      })
    }
  }

  const toggleStatus = useCallback(
    async (user: RmUser) => {
      const nextStatus = !user.isActive
      try {
        await setUserStatus.mutateAsync({ id: user.id, isActive: nextStatus })
        toast.success(`RM user ${nextStatus ? "activated" : "deactivated"}`)
      } catch (error) {
        toast.error("Could not change status", {
          description: errorMessage(error),
        })
      }
    },
    [setUserStatus],
  )

  const confirmDelete = useCallback((user: RmUser) => {
    setDeletingUser(user)
  }, [])

  async function deleteSelectedUser() {
    if (!deletingUser) return

    try {
      await deleteUser.mutateAsync(deletingUser.id)
      toast.success("RM user deleted")
      setDeletingUser(null)
      if (users.length === 1 && page > 1) setPage((current) => current - 1)
    } catch (error) {
      toast.error("Could not delete RM user", {
        description: errorMessage(error),
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RM Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage relationship manager access and contact details.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus />
          Add RM user
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
          placeholder="Search name, mobile, or email"
          aria-label="Search RM users"
        />
      </div>

      {usersQuery.isError && (
        <ErrorState
          title="Could not load RM users"
          message={errorMessage(usersQuery.error)}
        />
      )}

      <RmUsersTable
        users={users}
        isLoading={usersQuery.isLoading}
        isChanging={isChanging}
        onEdit={openEditDialog}
        onToggleStatus={(user) => void toggleStatus(user)}
        onDelete={confirmDelete}
      />

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {pagination
            ? `${pagination.total} user${pagination.total === 1 ? "" : "s"}`
            : "Loading users…"}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || usersQuery.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              !pagination || page >= pagination.totalPages || usersQuery.isFetching
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <RmUserFormDialog
        open={isFormOpen}
        user={editingUser}
        isSaving={isSaving}
        onOpenChange={setIsFormOpen}
        onSubmit={saveUser}
      />

      <ConfirmDialog
        open={deletingUser !== null}
        title="Delete RM user?"
        description={`This permanently deletes ${deletingUser?.name || "this RM user"} and revokes their sessions.`}
        confirmLabel="Delete user"
        isConfirming={deleteUser.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteUser.isPending) setDeletingUser(null)
        }}
        onConfirm={() => void deleteSelectedUser()}
      />
    </div>
  )
}

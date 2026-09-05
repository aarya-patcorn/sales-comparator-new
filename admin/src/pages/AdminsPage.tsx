import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Plus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { ErrorState, EmptyState, TableSkeleton } from "@/components/PageState"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useAdminUsers,
  useCreateAdminUser,
  useSetAdminStatus,
  type AdminUser,
} from "@/features/admins/api"

const PAGE_SIZE = 10
const adminSchema = z.object({ email: z.string().trim().email("Enter a valid email address") })

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
    : "Never"
}

export function AdminsPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [changingAdminId, setChangingAdminId] = useState<string | null>(null)
  const form = useForm<z.infer<typeof adminSchema>>({
    resolver: zodResolver(adminSchema),
    defaultValues: { email: "" },
  })
  const query = useAdminUsers({ search, page, pageSize: PAGE_SIZE })
  const createAdmin = useCreateAdminUser()
  const setStatus = useSetAdminStatus()

  async function addAdmin(values: z.infer<typeof adminSchema>) {
    try {
      await createAdmin.mutateAsync({ email: values.email.trim() })
      toast.success("Admin allow-list entry added")
      form.reset()
      setIsDialogOpen(false)
    } catch (error) {
      toast.error("Could not add admin", { description: errorMessage(error) })
    }
  }

  async function toggleStatus(admin: AdminUser) {
    setChangingAdminId(admin.id)
    try {
      await setStatus.mutateAsync({ id: admin.id, isActive: !admin.isActive })
      toast.success(`Admin ${admin.isActive ? "deactivated" : "activated"}`)
    } catch (error) {
      toast.error("Could not change admin status", { description: errorMessage(error) })
    } finally {
      setChangingAdminId(null)
    }
  }

  const admins = query.data?.admins ?? []
  const pagination = query.data?.pagination

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin allow-list</h1>
          <p className="text-sm text-muted-foreground">
            Adding an email here lets that Google account sign in as an admin.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus />
          Add admin
        </Button>
      </div>

      <Input
        className="max-w-sm"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(1)
        }}
        placeholder="Search admin email"
        aria-label="Search admin email"
      />

      {query.isError ? (
        <ErrorState title="Could not load admins" message={errorMessage(query.error)} />
      ) : (
        <div className="overflow-hidden rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableSkeleton columns={4} />
              ) : admins.length ? (
                admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">{admin.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={admin.isActive ? "default" : "secondary"}>
                        {admin.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(admin.lastLoginAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">Actions</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Admin access</DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={changingAdminId === admin.id}
                            onClick={() => void toggleStatus(admin)}
                          >
                            {admin.isActive ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <EmptyState message="No admin allow-list entries found." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">
          Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => current - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!pagination || page >= pagination.totalPages || query.isFetching} onClick={() => setPage((current) => current + 1)}>
          Next
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add admin</DialogTitle>
            <DialogDescription>
              Add the Google email address to the admin allow-list. No password is stored.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(addAdmin)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="admin@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Alert>
                <CircleAlert />
                <AlertDescription>
                  That account can sign in with Google after it is added and active.
                </AlertDescription>
              </Alert>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createAdmin.isPending}>
                  {createAdmin.isPending ? "Adding…" : "Add admin"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

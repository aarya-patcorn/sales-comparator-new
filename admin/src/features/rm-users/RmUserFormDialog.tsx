import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { RmUser, RmUserInput } from "@/features/rm-users/api"

const rmUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Enter 7–15 digits"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .or(z.literal("")),
})

type RmUserFormValues = z.infer<typeof rmUserSchema>

type RmUserFormDialogProps = {
  open: boolean
  user: RmUser | null
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: RmUserInput) => Promise<void>
}

function formValuesFor(user: RmUser | null): RmUserFormValues {
  return {
    name: user?.name ?? "",
    mobileNumber: user?.mobileNumber ?? "",
    email: user?.email ?? "",
  }
}

export function RmUserFormDialog({
  open,
  user,
  isSaving,
  onOpenChange,
  onSubmit,
}: RmUserFormDialogProps) {
  const form = useForm<RmUserFormValues>({
    resolver: zodResolver(rmUserSchema),
    defaultValues: formValuesFor(user),
  })

  useEffect(() => {
    if (open) form.reset(formValuesFor(user))
  }, [form, open, user])

  async function handleSubmit(values: RmUserFormValues) {
    await onSubmit({
      name: values.name.trim(),
      mobileNumber: values.mobileNumber.trim(),
      email: values.email.trim() || null,
    })
  }

  const isEditing = user !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit RM user" : "Add RM user"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this relationship manager's details."
              : "Create access for a new relationship manager."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Full name" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mobileNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="919876543210"
                      inputMode="numeric"
                      autoComplete="tel"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : isEditing ? "Save changes" : "Add user"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

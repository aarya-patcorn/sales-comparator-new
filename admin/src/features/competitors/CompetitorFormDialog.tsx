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
import type { Competitor, CompetitorInput } from "@/features/competitors/api"

const competitorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores"),
})

type CompetitorFormValues = z.infer<typeof competitorSchema>

type CompetitorFormDialogProps = {
  open: boolean
  competitor: Competitor | null
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CompetitorInput) => Promise<void>
}

export function CompetitorFormDialog({
  open,
  competitor,
  isSaving,
  onOpenChange,
  onSubmit,
}: CompetitorFormDialogProps) {
  const form = useForm<CompetitorFormValues>({
    resolver: zodResolver(competitorSchema),
    defaultValues: { name: "", slug: "" },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: competitor?.name ?? "",
        slug: competitor?.slug ?? "",
      })
    }
  }, [competitor, form, open])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {competitor ? "Edit competitor" : "Add competitor"}
          </DialogTitle>
          <DialogDescription>
            The slug is the stable lowercase identifier used by the API.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Competitor name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="competitor_name" {...field} />
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
                {isSaving ? "Saving…" : "Save competitor"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

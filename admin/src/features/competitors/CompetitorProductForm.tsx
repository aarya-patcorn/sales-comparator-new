import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, FileSearch } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { TechnicalParamsForm } from "@/components/TechnicalParamsForm"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type CompetitorProduct,
  type CompetitorProductUpdate,
} from "@/features/competitors/api"
import {
  technicalParamsFromTds,
  useTdsExtraction,
} from "@/features/tds/useTdsExtraction"
import {
  PARAM_FIELDS,
  createEmptyTechnicalParams,
  type TechnicalParams,
} from "@/lib/paramFields"
import { useProducts } from "@/features/products/api"

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  enClassification: z.string().trim().max(64),
  competesWith: z.string(),
})

type DetailsFormValues = z.infer<typeof detailsSchema>
type CreateMode = "tds_ai" | "manual"

type CompetitorProductFormProps = {
  open: boolean
  product: CompetitorProduct | null
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CompetitorProductUpdate, file?: File) => Promise<void>
}

function paramsFor(product: CompetitorProduct | null): TechnicalParams {
  if (!product) return createEmptyTechnicalParams()
  return Object.fromEntries(
    PARAM_FIELDS.map(([key]) => [key, product.technicalParams[key] ?? ""]),
  ) as TechnicalParams
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The TDS could not be read"
}

export function CompetitorProductForm({
  open,
  product,
  isSaving,
  onOpenChange,
  onSubmit,
}: CompetitorProductFormProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen)
      }}
    >
      {open && (
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <ProductFormContent
            key={product?.id ?? "new-product"}
            product={product}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function ProductFormContent({
  product,
  isSaving,
  onCancel,
  onSubmit,
}: Omit<CompetitorProductFormProps, "open" | "onOpenChange"> & {
  onCancel: () => void
}) {
  const form = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: product?.name ?? "",
      enClassification: product?.enClassification ?? "",
      competesWith: product?.competesWith ?? "",
    },
  })
  const productsQuery = useProducts({ search: "", status: "active", page: 1, pageSize: 100 })
  const extractTds = useTdsExtraction()
  const [mode, setMode] = useState<CreateMode>("tds_ai")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [uploadParams, setUploadParams] = useState(createEmptyTechnicalParams)
  const [manualParams, setManualParams] = useState(createEmptyTechnicalParams)
  const [editParams, setEditParams] = useState(() => paramsFor(product))

  async function selectFile(nextFile: File | null) {
    setFile(nextFile)
    setFileError(null)
    setExtractionError(null)
    setUploadParams(createEmptyTechnicalParams())

    if (!nextFile) return

    try {
      const result = await extractTds.mutateAsync(nextFile)
      setUploadParams(technicalParamsFromTds(result.params))
    } catch (error) {
      // Extraction is optional assistance; the admin can still enter every value.
      setExtractionError(errorMessage(error))
    }
  }

  async function save(values: DetailsFormValues) {
    if (!product && mode === "tds_ai" && !file) {
      setFileError("Choose a TDS file before saving")
      return
    }

    const technicalParams = product
      ? editParams
      : mode === "tds_ai"
        ? uploadParams
        : manualParams

    await onSubmit(
      {
        name: values.name.trim(),
        enClassification: values.enClassification.trim() || null,
        competesWith: values.competesWith || null,
        // These are the values the admin reviewed, not raw AI output.
        technicalParams,
      },
      !product && mode === "tds_ai" ? file ?? undefined : undefined,
    )
  }

  const isBusy = isSaving || extractTds.isPending

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {product ? "Edit competitor product" : "Add competitor product"}
        </DialogTitle>
        <DialogDescription>
          AI suggestions are never saved until an admin reviews and submits this form.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(save)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product name</FormLabel>
                  <FormControl>
                    <Input placeholder="Product name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enClassification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>EN classification</FormLabel>
                  <FormControl>
                    <Input placeholder="C2TE S1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="competesWith"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Competes with Kamdhenu product</FormLabel>
                <Select
                  value={field.value || "__none__"}
                  onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                  disabled={isBusy || productsQuery.isLoading}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No automatic match" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">No automatic match</SelectItem>
                    {(productsQuery.data?.products ?? []).map((kamdhenuProduct) => (
                      <SelectItem key={kamdhenuProduct.id} value={kamdhenuProduct.code}>
                        {kamdhenuProduct.code} - {kamdhenuProduct.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {product ? (
            <div className="space-y-4">
              <Alert>
                <FileSearch />
                <AlertTitle>
                  Saved source: {product.specSource === "tds_ai" ? "TDS" : "Manual"}
                </AlertTitle>
                <AlertDescription>
                  Editing changes the confirmed values but keeps the original source record.
                </AlertDescription>
              </Alert>
              <TechnicalParamsForm
                value={editParams}
                onChange={setEditParams}
                disabled={isSaving}
              />
            </div>
          ) : (
            <Tabs value={mode} onValueChange={(value) => setMode(value as CreateMode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tds_ai">Upload TDS</TabsTrigger>
                <TabsTrigger value="manual">Enter manually</TabsTrigger>
              </TabsList>

              <TabsContent value="tds_ai" className="space-y-5 pt-4">
                <div className="space-y-2">
                  <FormLabel htmlFor="tds-file">TDS file</FormLabel>
                  <Input
                    id="tds-file"
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={isBusy}
                    onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
                  />
                  {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                </div>

                {extractTds.isPending && (
                  <Alert>
                    <FileSearch className="animate-pulse" />
                    <AlertTitle>Reading the TDS…</AlertTitle>
                    <AlertDescription>
                      Extracting suggestions for the 20 specification fields.
                    </AlertDescription>
                  </Alert>
                )}

                {extractTds.isSuccess && !extractionError && (
                  <Alert>
                    <FileSearch />
                    <AlertTitle>AI-suggested values are ready</AlertTitle>
                    <AlertDescription>
                      Review every value below and correct anything the document reader missed.
                    </AlertDescription>
                  </Alert>
                )}

                {extractionError && (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>Automatic extraction failed</AlertTitle>
                    <AlertDescription>
                      {extractionError} You can still fill the fields below manually and save.
                    </AlertDescription>
                  </Alert>
                )}

                <TechnicalParamsForm
                  value={uploadParams}
                  onChange={setUploadParams}
                  disabled={isBusy}
                />
              </TabsContent>

              <TabsContent value="manual" className="pt-4">
                <TechnicalParamsForm
                  value={manualParams}
                  onChange={setManualParams}
                  disabled={isSaving}
                />
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isSaving ? "Saving…" : "Save product"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  )
}

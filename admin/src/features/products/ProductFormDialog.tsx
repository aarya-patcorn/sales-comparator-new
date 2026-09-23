import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, FileSearch } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { TechnicalParamsForm } from "@/components/TechnicalParamsForm"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea } from "@/components/ui/textarea"
import {
  useProductOptions,
  type Product,
  type ProductInput,
} from "@/features/products/api"
import {
  technicalParamsFromTds,
  useTdsExtraction,
} from "@/features/tds/useTdsExtraction"
import {
  PARAM_FIELDS,
  createEmptyTechnicalParams,
  type ParamKey,
  type TechnicalParams,
} from "@/lib/paramFields"

const APPLICATION_AREAS = [
  ["living_room", "Living Room"],
  ["bedroom", "Bedroom"],
  ["kitchen", "Kitchen"],
  ["bathroom", "Bathroom"],
  ["balcony", "Balcony"],
  ["terrace", "Terrace"],
  ["exterior_facade", "Exterior Facade"],
  ["swimming_pool", "Swimming Pool"],
] as const

const INSTALLATION_SUITABILITY = [
  ["indoor", "Indoor"],
  ["outdoor", "Outdoor"],
] as const

const technicalParamShape = Object.fromEntries(
  PARAM_FIELDS.map(([key]) => [key, z.string()]),
) as Record<ParamKey, z.ZodString>

const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores"),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000),
  enClassification: z.string().trim().max(64),
  installationSuitability: z.array(z.enum(["indoor", "outdoor"])),
  applicationAreas: z.array(z.string()),
  substrateIds: z.array(z.string()),
  tileTypeIds: z.array(z.string()),
  tileSizes: z.array(z.string()),
  technicalParams: z.object(technicalParamShape),
})

type ProductFormValues = z.infer<typeof productSchema>

type ProductFormDialogProps = {
  open: boolean
  product: Product | null
  isSaving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ProductInput) => Promise<void>
}

function technicalParamsFor(product: Product | null): TechnicalParams {
  if (!product) return createEmptyTechnicalParams()

  return Object.fromEntries(
    PARAM_FIELDS.map(([key]) => [key, product.technicalParams[key] ?? ""]),
  ) as TechnicalParams
}

function formValuesFor(product: Product | null): ProductFormValues {
  return {
    code: product?.code ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    enClassification: product?.enClassification ?? "",
    installationSuitability: product?.installationSuitability ?? [],
    applicationAreas: product?.applicationAreas ?? [],
    substrateIds: product?.substrateIds ?? [],
    tileTypeIds: product?.tileTypeIds ?? [],
    tileSizes: product?.tileSizes ?? [],
    technicalParams: technicalParamsFor(product),
  }
}

function extractionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The TDS could not be read"
}

export function ProductFormDialog({
  open,
  product,
  isSaving,
  onOpenChange,
  onSubmit,
}: ProductFormDialogProps) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: formValuesFor(product),
  })
  const extractTds = useTdsExtraction()
  const productOptions = useProductOptions()
  const resetExtraction = extractTds.reset
  const [extractionError, setExtractionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    form.reset(formValuesFor(product))
    resetExtraction()
    setExtractionError(null)
  }, [form, open, product, resetExtraction])

  async function selectTds(file: File | null) {
    setExtractionError(null)
    resetExtraction()
    if (!file) return

    try {
      const result = await extractTds.mutateAsync(file)
      // Only the technical fields are filled; catalogue details stay untouched.
      form.setValue("technicalParams", technicalParamsFromTds(result.params), {
        shouldDirty: true,
      })
    } catch (error) {
      // Extraction is optional, so failed reads leave existing values editable.
      setExtractionError(extractionErrorMessage(error))
    }
  }

  async function handleSubmit(values: ProductFormValues) {
    await onSubmit({
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description.trim() || null,
      enClassification: values.enClassification.trim() || null,
      installationSuitability: values.installationSuitability,
      applicationAreas: values.applicationAreas,
      substrateIds: values.substrateIds,
      tileTypeIds: values.tileTypeIds,
      tileSizes: values.tileSizes,
      technicalParams: values.technicalParams,
    })
  }

  const isEditing = product !== null
  const isBusy = isSaving || extractTds.isPending
  const substrateIds = form.watch("substrateIds")
  const tileTypeIds = form.watch("tileTypeIds")
  const compatibleTileTypes = (productOptions.data?.tileTypes ?? []).filter(
    (tileType) =>
      substrateIds.length === 0 ||
      productOptions.data?.substrates.some(
        (substrate) =>
          substrateIds.includes(substrate.id) && substrate.tileTypeIds.includes(tileType.id),
      ),
  )
  const availableTileSizes = compatibleTileTypes
    .filter((tileType) => tileTypeIds.includes(tileType.id))
    .flatMap((tileType) => tileType.sizes)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            Enter the catalogue details and published technical specifications.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-8" onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product code</FormLabel>
                    <FormControl>
                      <Input placeholder="K90" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name</FormLabel>
                    <FormControl>
                      <Input placeholder="Kamdhenu K90" {...field} />
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
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Short product description"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="installationSuitability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Installation suitability</FormLabel>
                  <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
                    {INSTALLATION_SUITABILITY.map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(value)}
                          disabled={isBusy}
                          onCheckedChange={(checked) => {
                            field.onChange(
                              checked
                                ? [...field.value, value]
                                : field.value.filter((item) => item !== value),
                            )
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="applicationAreas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Application areas</FormLabel>
                  <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-4">
                    {APPLICATION_AREAS.map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(value)}
                          onCheckedChange={(checked) => {
                            field.onChange(
                              checked
                                ? [...field.value, value]
                                : field.value.filter((item) => item !== value),
                            )
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 rounded-md border p-4">
              <div>
                <h3 className="font-medium">Recommendation applicability</h3>
                <p className="text-sm text-muted-foreground">
                  Select the substrates, tile kinds, and tile sizes this product supports.
                </p>
              </div>
              <FormField
                control={form.control}
                name="substrateIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Substrates</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {(productOptions.data?.substrates ?? []).map((substrate) => (
                        <label key={substrate.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(substrate.id)}
                            disabled={productOptions.isLoading || isBusy}
                            onCheckedChange={(checked) => {
                              field.onChange(
                                checked
                                  ? [...field.value, substrate.id]
                                  : field.value.filter((id) => id !== substrate.id),
                              )
                            }}
                          />
                          {substrate.name}
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tileTypeIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tile kinds</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {compatibleTileTypes.map((tileType) => (
                        <label key={tileType.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(tileType.id)}
                            disabled={productOptions.isLoading || isBusy}
                            onCheckedChange={(checked) => {
                              field.onChange(
                                checked
                                  ? [...field.value, tileType.id]
                                  : field.value.filter((id) => id !== tileType.id),
                              )
                            }}
                          />
                          {tileType.name}
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tileSizes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tile sizes</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[...new Set(availableTileSizes)].map((size) => (
                        <label key={size} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(size)}
                            disabled={productOptions.isLoading || isBusy || tileTypeIds.length === 0}
                            onCheckedChange={(checked) => {
                              field.onChange(
                                checked
                                  ? [...field.value, size]
                                  : field.value.filter((item) => item !== size),
                              )
                            }}
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                    {tileTypeIds.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Select a tile kind to choose its sizes.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="technicalParams"
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-4 rounded-md border p-4">
                    <div>
                      <h3 className="font-medium">Upload TDS (optional)</h3>
                      <p className="text-sm text-muted-foreground">
                        Use a TDS to suggest values for the technical specifications.
                      </p>
                    </div>
                    <Input
                      type="file"
                      accept="application/pdf,image/*"
                      disabled={isBusy}
                      onChange={(event) =>
                        void selectTds(event.target.files?.[0] ?? null)
                      }
                    />
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
                          Review the values below. Nothing is saved until you submit the form.
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
                  </div>
                  <TechnicalParamsForm
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isBusy}
                  />
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
                {isSaving ? "Saving…" : isEditing ? "Save changes" : "Add product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

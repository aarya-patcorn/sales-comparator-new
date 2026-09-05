import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PARAM_FIELDS,
  type ParamKey,
  type TechnicalParams,
} from "@/lib/paramFields"

type TechnicalParamsFormProps = {
  value: TechnicalParams
  onChange: (value: TechnicalParams) => void
  disabled?: boolean
}

export function TechnicalParamsForm({
  value,
  onChange,
  disabled = false,
}: TechnicalParamsFormProps) {
  function updateParam(key: ParamKey, nextValue: string) {
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">Technical specifications</h3>
        <p className="text-sm text-muted-foreground">
          Enter values exactly as published, including ranges and units.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PARAM_FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`technical-param-${key}`}>{label}</Label>
            <Input
              id={`technical-param-${key}`}
              value={value[key]}
              disabled={disabled}
              placeholder="Not specified"
              onChange={(event) => updateParam(key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

// This ordered list must stay in sync with server/src/lib/paramFields.ts.
export const PARAM_FIELDS = [
  ["open_time", "Open Time"],
  ["pot_life", "Pot Life"],
  ["adjustability_time", "Adjustability Time"],
  ["tensile_adhesion_is", "Initial Tensile Adhesion (IS)"],
  ["tensile_adhesion_water", "Tensile Adhesion after Water Immersion"],
  ["tensile_adhesion_heat", "Tensile Adhesion after Heat Aging"],
  ["tensile_adhesion_freeze_thaw", "Tensile Adhesion after Freeze-Thaw"],
  ["slip_resistance", "Slip Resistance"],
  ["shear_adhesion_dry", "Shear Adhesion (Dry)"],
  ["shear_adhesion_wet", "Shear Adhesion (Wet)"],
  ["mixing_ratio", "Mixing Ratio (powder:water)"],
  ["coverage", "Coverage"],
  ["setting_time", "Setting Time"],
  ["adhesive_thickness", "Adhesive Thickness"],
  ["mixed_density", "Mixed Density"],
  ["application_temp", "Application Temp"],
  ["voc_content", "VOC Content"],
  ["shelf_life", "Shelf Life"],
  ["packaging", "Packaging"],
  ["color", "Color"],
] as const

export type ParamKey = (typeof PARAM_FIELDS)[number][0]
export type TechnicalParams = Record<ParamKey, string>

export function createEmptyTechnicalParams(): TechnicalParams {
  return Object.fromEntries(PARAM_FIELDS.map(([key]) => [key, ""])) as TechnicalParams
}

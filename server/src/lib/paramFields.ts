/**
 * The canonical technical-parameter field set (REBUILD_BLUEPRINT §3).
 *
 * Single source of truth: the server, the admin form, and the AI extraction prompt
 * all read from here, so adding or renaming a spec is a one-line change.
 *
 * Order matters — it is the display order of the comparison table columns.
 */
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
] as const satisfies readonly (readonly [string, string])[];

export type ParamField = (typeof PARAM_FIELDS)[number];

/** Union of the 20 canonical parameter keys. */
export type ParamKey = ParamField[0];

/** Just the keys, in blueprint order. */
export const PARAM_KEYS: readonly ParamKey[] = PARAM_FIELDS.map(
  ([key]) => key,
);

/** key -> display label. */
export const PARAM_LABELS: Readonly<Record<ParamKey, string>> = Object.freeze(
  Object.fromEntries(PARAM_FIELDS) as Record<ParamKey, string>,
);

/** Narrowing guard for values arriving from JSON/query strings. */
export function isParamKey(value: string): value is ParamKey {
  return Object.prototype.hasOwnProperty.call(PARAM_LABELS, value);
}

import { z } from "zod";

export const MAX_MONEY = 9999999999.99;
export const MAX_VARIANTS = 50;

const money = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .finite(`${label} must be a valid number.`)
    .min(0, `${label} cannot be negative.`)
    .max(MAX_MONEY, `${label} is too large.`)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${label} can have at most 2 decimal places.`);

export const variantSchema = z
  .object({
    name: z.string().trim().min(1, "Variant name is required.").max(120, "Variant name must be 120 characters or fewer."),
    priceAddOn: money("Price add-on")
  })
  .strict();

const variantList = z
  .array(variantSchema)
  .max(MAX_VARIANTS, `A product can have at most ${MAX_VARIANTS} variants.`)
  .superRefine((variants, ctx) => {
    const seen = new Set<string>();
    variants.forEach((variant, index) => {
      const key = variant.name.trim().toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [index, "name"], message: "Variant names must be unique." });
      seen.add(key);
    });
  });

const productFields = {
  name: z.string().trim().min(1, "Product name is required.").max(160, "Product name must be 160 characters or fewer."),
  type: z.string().trim().min(1, "Product type is required.").max(60, "Product type must be 60 characters or fewer."),
  salesPrice: money("Sales price"),
  costPrice: money("Cost price"),
  notes: z.string().trim().max(2000, "Notes must be 2000 characters or fewer.").optional().or(z.literal(""))
};

export const productCreateSchema = z.object({ ...productFields, variants: variantList.optional() }).strict();
export const productUpdateSchema = z
  .object({
    name: productFields.name.optional(),
    type: productFields.type.optional(),
    salesPrice: productFields.salesPrice.optional(),
    costPrice: productFields.costPrice.optional(),
    notes: productFields.notes,
    variants: variantList.optional()
  })
  .strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Flattens Zod issues into `{ "salesPrice": "…", "variants.0.name": "…" }` so forms can show messages beside fields. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

export const PRODUCT_SORTS = {
  newest: [{ createdAt: "desc" as const }],
  oldest: [{ createdAt: "asc" as const }],
  name: [{ name: "asc" as const }],
  price_asc: [{ salesPrice: "asc" as const }, { name: "asc" as const }],
  price_desc: [{ salesPrice: "desc" as const }, { name: "asc" as const }]
};
export type ProductSort = keyof typeof PRODUCT_SORTS;

export type ProductListQuery = { search: string; type: string; sort: ProductSort; page: number; pageSize: number };

export function parseListQuery(query: Record<string, unknown>): ProductListQuery {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const int = (value: unknown, fallback: number) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const sort = text(query.sort, 20);
  return {
    search: text(query.search, 160),
    type: text(query.type, 60),
    sort: sort in PRODUCT_SORTS ? (sort as ProductSort) : "newest",
    page: Math.max(1, int(query.page, 1)),
    pageSize: Math.min(100, Math.max(1, int(query.pageSize, 20)))
  };
}

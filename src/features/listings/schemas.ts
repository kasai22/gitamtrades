import { z } from "zod";
import { MAX_DESCRIPTION, MAX_PRICE_INR, MAX_TITLE } from "./constants";

const uuid = z.uuid({ message: "Invalid id" });

/**
 * Listing form schema shared by the client form (React Hook Form) and the server action, so
 * validation feedback matches what the server enforces (AC-03).
 */
export const listingFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Add a short title (at least 3 characters).")
      .max(MAX_TITLE, `Keep the title under ${MAX_TITLE} characters.`)
      .refine((value) => /\p{L}.*\p{L}/u.test(value), "The title needs some words, not just numbers or symbols."),
    categoryId: uuid.or(z.literal("")).refine((value) => value !== "", "Choose a category."),
    priceInr: z.coerce
      .number({ message: "Enter a price in rupees, or 0 for free." })
      .int("Use whole rupees.")
      .min(0, "Price can't be negative.")
      .max(MAX_PRICE_INR, "That price is above the marketplace limit."),
    condition: z.enum(["new", "like_new", "good", "fair", "for_parts"], { message: "Choose the item's condition." }),
    description: z.string().trim().max(MAX_DESCRIPTION, `Keep the description under ${MAX_DESCRIPTION} characters.`),
    meetupAreaId: uuid.or(z.literal("")),
    ticketEventName: z.string().trim().max(100, "Keep the event name under 100 characters."),
    ticketEventDate: z.union([z.iso.date({ message: "Enter a valid date." }), z.literal("")]),
    ticketTransferConfirmed: z.boolean(),
    imageIds: z.array(uuid).max(20),
    declarationOwnsItem: z.boolean(),
    declarationCompliesWithPolicy: z.boolean(),
    clientRequestId: uuid,
    intent: z.enum(["publish", "draft"]),
  })
  .superRefine((value, ctx) => {
    if (value.intent !== "publish") return;
    if (!value.declarationOwnsItem) {
      ctx.addIssue({ code: "custom", path: ["declarationOwnsItem"], message: "Confirm you own the item or are allowed to sell it." });
    }
    if (!value.declarationCompliesWithPolicy) {
      ctx.addIssue({ code: "custom", path: ["declarationCompliesWithPolicy"], message: "Confirm the item follows the law and marketplace rules." });
    }
  });

export type ListingFormInput = z.input<typeof listingFormSchema>;
export type ListingFormValues = z.output<typeof listingFormSchema>;

export const statusChangeSchema = z.object({
  listingId: uuid,
  status: z.enum(["active", "on_hold", "sold", "removed"]),
});

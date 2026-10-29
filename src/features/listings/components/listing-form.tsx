"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PriceDisplay } from "@/components/marketplace/badges";
import { FormField, FormMessage, describedBy } from "@/components/shared/form";
import { SafetyTips } from "@/components/shared/safety";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { features } from "@/lib/config";
import { saveListing, recordListingStarted } from "../actions";
import { CONDITIONS, CONDITION_LABELS, MAX_DESCRIPTION, MAX_TITLE } from "../constants";
import type { Category, MeetupArea } from "../queries";
import { listingFormSchema, type ListingFormInput, type ListingFormValues } from "../schemas";
import { ImageUploader, type UploadedImage } from "./image-uploader";

type Props = {
  categories: Category[];
  meetupAreas: MeetupArea[];
  maxImages: number;
  listingId?: string;
  isDraft?: boolean;
  initial?: Partial<ListingFormInput>;
  initialImages?: UploadedImage[];
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function ListingForm({ categories, meetupAreas, maxImages, listingId, isDraft = true, initial, initialImages = [] }: Props) {
  const router = useRouter();
  const [images, setImages] = useState<UploadedImage[]>(initialImages);
  const [preview, setPreview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const form = useForm<ListingFormInput, unknown, ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: "",
      categoryId: "",
      priceInr: "",
      condition: undefined,
      description: "",
      meetupAreaId: "",
      ticketEventName: "",
      ticketEventDate: "",
      ticketTransferConfirmed: false,
      declarationOwnsItem: false,
      declarationCompliesWithPolicy: false,
      intent: "publish",
      ...initial,
      imageIds: initialImages.map((i) => i.id),
      clientRequestId,
    },
  });
  const { register, handleSubmit, setValue, setError, formState, control } = form;
  const errors = formState.errors;
  const values = useWatch({ control });
  const category = categories.find((c) => c.id === values.categoryId);
  const isTicket = Boolean(category?.isTicket);

  useEffect(() => {
    if (!listingId) void recordListingStarted();
  }, [listingId]);

  useEffect(() => {
    setValue("imageIds", images.map((i) => i.id));
  }, [images, setValue]);

  const submit = (intent: "publish" | "draft") => (event?: React.BaseSyntheticEvent) => {
    // The schema only requires the declaration when publishing, so set the intent before validating.
    setValue("intent", intent);
    return handleSubmit(
      (data) => {
        setFormError(null);
        startTransition(async () => {
          const result = await saveListing(listingId ?? null, { ...data, intent });
          if (!result.ok) {
            setFormError(result.error);
            for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
              if (messages?.[0]) setError(field as keyof ListingFormInput, { message: messages[0] });
            }
            return;
          }
          const { outcome, listingId: id } = result.data;
          if (outcome === "draft") toast.success("Draft saved.");
          else if (outcome === "allow") toast.success(listingId && !isDraft ? "Changes saved." : "Published! Your listing is live.");
          else if (outcome === "limit") toast.warning("Saved. It's hidden until a quick safety check is done.");
          else toast.error("Not published. See what needs changing.");
          router.push(outcome === "allow" ? `/listings/${id}?published=1` : `/listings/${id}`);
          router.refresh();
        });
      },
      () => setFormError("Check the highlighted fields."),
    )(event);
  };

  const err = (name: keyof ListingFormInput) => {
    const message = errors[name]?.message;
    return message ? [String(message)] : undefined;
  };

  if (preview) {
    return (
      <div className="grid gap-6">
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
              {images[0]?.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed preview URL
                <img src={images[0].thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No photo</div>
              )}
            </div>
            <div>
              <PriceDisplay priceInr={Number(values.priceInr) || 0} size="lg" />
              <h2 className="mt-1 text-xl font-semibold">{values.title || "Untitled"}</h2>
              <p className="text-sm text-muted-foreground">
                {values.condition ? CONDITION_LABELS[values.condition] : "Condition not set"} · {category?.name ?? "No category"}
                {features.meetupAreas && <> · {meetupAreas.find((m) => m.id === values.meetupAreaId)?.name ?? "Arrange in chat"}</>}
              </p>
              <p className="mt-3 text-sm whitespace-pre-line">{values.description || "No description."}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(false)}>
            <Pencil aria-hidden /> Back to editing
          </Button>
          <Button type="button" onClick={submit("publish")} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} {listingId && !isDraft ? "Save changes" : "Publish now"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit("publish")} className="grid gap-8" noValidate>
      <FormMessage error={formError} />

      <section className="grid gap-4" aria-labelledby="photos-heading">
        <h2 id="photos-heading" className="text-lg font-semibold">Photos <span className="text-sm font-normal text-muted-foreground">(recommended)</span></h2>
        <ImageUploader images={images} onChange={setImages} max={maxImages} isTicket={isTicket} />
      </section>

      <section className="grid gap-4" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-lg font-semibold">Details</h2>
        <FormField label="Title" htmlFor="title" errors={err("title")} hint="What is it? Include brand or edition, e.g. “HC Verma Concepts of Physics Vol 1”.">
          <Input id="title" maxLength={MAX_TITLE} {...register("title")} {...describedBy("title", err("title"), true)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Category" htmlFor="categoryId" errors={err("categoryId")}>
            <select id="categoryId" className={selectClass} {...register("categoryId")} {...describedBy("categoryId", err("categoryId"))}>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Asking price (₹)" htmlFor="priceInr" errors={err("priceInr")} hint="Enter 0 to give it away for free.">
            <Input id="priceInr" inputMode="numeric" placeholder="e.g. 450" {...register("priceInr")} {...describedBy("priceInr", err("priceInr"), true)} />
          </FormField>
        </div>
        <fieldset className="grid gap-2" aria-describedby={err("condition") ? "condition-error" : undefined}>
          <legend className="mb-1 text-sm font-medium">Condition</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CONDITIONS.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-secondary/50">
                <input type="radio" value={c.value} {...register("condition")} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {err("condition") && <p id="condition-error" className="text-sm text-destructive">{err("condition")![0]}</p>}
        </fieldset>
        <FormField label="Description" htmlFor="description" optional errors={err("description")} hint="Mention defects, what's included, age and how much it's been used.">
          <Textarea id="description" rows={5} maxLength={MAX_DESCRIPTION} {...register("description")} {...describedBy("description", err("description"), true)} />
        </FormField>
        {features.meetupAreas && (
        <FormField label="Meetup area" htmlFor="meetupAreaId" hint="A general campus spot. Never share your room number in a listing.">
          <select id="meetupAreaId" className={selectClass} {...register("meetupAreaId")}>
            <option value="">Arrange in chat</option>
            {meetupAreas.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </FormField>
        )}
      </section>

      {isTicket && (
        <section className="grid gap-4 rounded-xl border border-warning-foreground/20 bg-warning/40 p-4" aria-labelledby="ticket-heading">
          <h2 id="ticket-heading" className="font-semibold">Ticket details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Event name" htmlFor="ticketEventName" errors={err("ticketEventName")}>
              <Input id="ticketEventName" maxLength={100} {...register("ticketEventName")} />
            </FormField>
            <FormField label="Event date" htmlFor="ticketEventDate" optional errors={err("ticketEventDate")}>
              <Input id="ticketEventDate" type="date" {...register("ticketEventDate")} />
            </FormField>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={Boolean(values.ticketTransferConfirmed)}
              onCheckedChange={(v) => setValue("ticketTransferConfirmed", v === true, { shouldValidate: true })}
              className="mt-0.5"
              aria-describedby="ticket-transfer-hint"
            />
            <span>
              I confirm this ticket can be legally transferred or resold under the event or venue&apos;s terms, and it isn&apos;t fake or duplicated.
              <span id="ticket-transfer-hint" className="mt-1 block text-xs text-muted-foreground">
                Don&apos;t include QR codes, barcodes or booking codes anywhere in the listing. Share them only at the exchange.
              </span>
            </span>
          </label>
          {err("ticketTransferConfirmed") && <p className="text-sm text-destructive">{err("ticketTransferConfirmed")![0]}</p>}
        </section>
      )}

      <section className="grid gap-3 rounded-xl border bg-muted/40 p-4" aria-labelledby="declaration-heading">
        <h2 id="declaration-heading" className="font-semibold">Seller declaration</h2>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={Boolean(values.declarationOwnsItem)}
            onCheckedChange={(v) => setValue("declarationOwnsItem", v === true, { shouldValidate: formState.isSubmitted })}
            className="mt-0.5"
            aria-invalid={err("declarationOwnsItem") ? true : undefined}
          />
          <span>I own this item or am allowed to sell it.</span>
        </label>
        {err("declarationOwnsItem") && <p className="text-sm text-destructive">{err("declarationOwnsItem")![0]}</p>}
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={Boolean(values.declarationCompliesWithPolicy)}
            onCheckedChange={(v) => setValue("declarationCompliesWithPolicy", v === true, { shouldValidate: formState.isSubmitted })}
            className="mt-0.5"
            aria-invalid={err("declarationCompliesWithPolicy") ? true : undefined}
          />
          <span>
            It&apos;s legal to sell and follows the{" "}
            <Link href="/policies/prohibited-items" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">marketplace rules</Link>.
          </span>
        </label>
        {err("declarationCompliesWithPolicy") && <p className="text-sm text-destructive">{err("declarationCompliesWithPolicy")![0]}</p>}
        <p className="text-xs text-muted-foreground">
          Buyers pay you in person after inspecting the item. The marketplace never collects payment and doesn&apos;t guarantee sales.
        </p>
      </section>

      <SafetyTips context="listing" />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {listingId && !isDraft ? "Save changes" : "Publish now"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={() => setPreview(true)} disabled={pending}>
          <Eye aria-hidden /> Preview
        </Button>
        {isDraft && (
          <Button type="button" size="lg" variant="ghost" onClick={submit("draft")} disabled={pending}>
            Save draft
          </Button>
        )}
      </div>
    </form>
  );
}

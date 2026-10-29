"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormMessage } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REASON_CODES, policySchema, type PolicyConfig, type PolicyRule } from "@/features/moderation/policy";
import { createPolicyVersion } from "../actions";

type NumberPath =
  | ["listingExpiryDays"] | ["expiryReminderDays"] | ["maxImagesPerListing"]
  | ["rateLimits", keyof PolicyConfig["rateLimits"]]
  | ["reports", keyof PolicyConfig["reports"]]
  | ["repeatOffender", keyof PolicyConfig["repeatOffender"]];

const NUMBER_FIELDS: { path: NumberPath; label: string; hint: string }[] = [
  { path: ["reports", "highSeverityAutoLimitThreshold"], label: "High-severity reporters to auto-quarantine", hint: "Distinct reporters choosing a high-severity reason" },
  { path: ["reports", "anyReasonAutoLimitThreshold"], label: "Reporters (any reason) to auto-quarantine", hint: "Users are never auto-suspended by reports" },
  { path: ["repeatOffender", "blockedListingsThreshold"], label: "Auto-blocks before repeat-offender review", hint: "New listings from this seller are quarantined" },
  { path: ["repeatOffender", "windowDays"], label: "Repeat-offender window (days)", hint: "" },
  { path: ["rateLimits", "listingsPerDay"], label: "Listings per seller per day", hint: "Spam limit" },
  { path: ["rateLimits", "messagesPerMinute"], label: "Messages per minute", hint: "" },
  { path: ["rateLimits", "messagesPerDay"], label: "Messages per day", hint: "" },
  { path: ["rateLimits", "conversationsPerDay"], label: "New conversations per day", hint: "" },
  { path: ["rateLimits", "reportsPerDay"], label: "Reports per user per day", hint: "" },
  { path: ["listingExpiryDays"], label: "Listing expiry (days)", hint: "" },
  { path: ["expiryReminderDays"], label: "Expiry reminder (days before)", hint: "" },
  { path: ["maxImagesPerListing"], label: "Max photos per listing", hint: "" },
];

function getNumber(config: PolicyConfig, path: NumberPath): number {
  return path.length === 1 ? config[path[0]] : (config[path[0]] as Record<string, number>)[path[1]];
}

function setNumber(config: PolicyConfig, path: NumberPath, value: number): PolicyConfig {
  if (path.length === 1) return { ...config, [path[0]]: value };
  return { ...config, [path[0]]: { ...(config[path[0]] as Record<string, number>), [path[1]]: value } } as PolicyConfig;
}

const parseTerms = (text: string) => [...new Set(text.split(/[\n,]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** Structured editor for the versioned moderation policy. Saving creates a new version (rollback = activate an older one). */
export function PolicyEditor({ initial, categories }: { initial: PolicyConfig; categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [config, setConfig] = useState<PolicyConfig>(initial);
  const [termsText, setTermsText] = useState<string[]>(initial.rules.map((r) => r.terms.join("\n")));
  const [note, setNote] = useState("");
  const [activate, setActivate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const candidate = useMemo<PolicyConfig>(() => ({ ...config, rules: config.rules.map((r, i) => ({ ...r, terms: parseTerms(termsText[i] ?? "") })) }), [config, termsText]);
  const validation = useMemo(() => {
    const parsed = policySchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return `${issue?.path.join(".") || "policy"}: ${issue?.message}`;
    }
    const ids = candidate.rules.map((r) => r.id);
    return new Set(ids).size !== ids.length ? "Each rule needs a unique ID." : null;
  }, [candidate]);
  const changed = JSON.stringify(candidate) !== JSON.stringify(initial);

  const updateRule = (index: number, patch: Partial<PolicyRule>) => setConfig((c) => ({ ...c, rules: c.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  const addRule = () => {
    setConfig((c) => ({ ...c, rules: [...c.rules, { id: `rule-${c.rules.length + 1}`, action: "limit", reasonCode: "needs_review_term", terms: ["placeholder"] }] }));
    setTermsText((t) => [...t, ""]);
  };
  const removeRule = (index: number) => {
    setConfig((c) => ({ ...c, rules: c.rules.filter((_, i) => i !== index) }));
    setTermsText((t) => t.filter((_, i) => i !== index));
  };

  const save = () =>
    start(async () => {
      setError(null);
      const result = await createPolicyVersion({ config: candidate, note, activate });
      if (!result.ok) return setError(result.error);
      toast.success(result.message ?? "Saved.");
      setNote("");
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold">Thresholds and limits</legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NUMBER_FIELDS.map((f) => {
            const id = `pol-${f.path.join("-")}`;
            return (
              <div key={id} className="grid gap-1">
                <label htmlFor={id} className="text-xs font-medium">{f.label}</label>
                <Input id={id} type="number" inputMode="numeric" value={getNumber(config, f.path)} onChange={(e) => setConfig((c) => setNumber(c, f.path, Number(e.target.value)))} className="h-9" />
                {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Prohibited categories</legend>
        <p className="mb-2 text-xs text-muted-foreground">New listings in a checked category are blocked with the “category unavailable” reason. Existing listings aren&apos;t changed.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.disabledCategorySlugs.includes(c.slug)}
                onChange={(e) =>
                  setConfig((cfg) => ({ ...cfg, disabledCategorySlugs: e.target.checked ? [...cfg.disabledCategorySlugs, c.slug] : cfg.disabledCategorySlugs.filter((s) => s !== c.slug) }))
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Restricted keywords and phrases</legend>
        <p className="text-xs text-muted-foreground">
          <strong>Block</strong> stops publication with the reason shown to the seller (high-confidence matches only). <strong>Limit</strong> publishes the listing quarantined for manual review — use it for uncertain terms.
        </p>
        {config.rules.map((rule, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_7rem_1fr_auto]">
            <div className="grid gap-1">
              <label htmlFor={`rule-id-${i}`} className="text-[11px] font-medium text-muted-foreground">Rule ID</label>
              <Input id={`rule-id-${i}`} value={rule.id} onChange={(e) => updateRule(i, { id: e.target.value.toLowerCase() })} className="h-9 font-mono text-xs" />
            </div>
            <div className="grid gap-1">
              <label htmlFor={`rule-action-${i}`} className="text-[11px] font-medium text-muted-foreground">Action</label>
              <select id={`rule-action-${i}`} value={rule.action} onChange={(e) => updateRule(i, { action: e.target.value as "block" | "limit" })} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                <option value="block">Block</option>
                <option value="limit">Limit (review)</option>
              </select>
            </div>
            <div className="grid gap-1 sm:row-span-2">
              <label htmlFor={`rule-terms-${i}`} className="text-[11px] font-medium text-muted-foreground">Terms (one per line or comma-separated)</label>
              <Textarea id={`rule-terms-${i}`} rows={3} value={termsText[i] ?? ""} onChange={(e) => setTermsText((t) => t.map((x, j) => (j === i ? e.target.value : x)))} className="font-mono text-xs" />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRule(i)} aria-label={`Remove rule ${rule.id}`} className="sm:row-span-2">
              <Trash2 aria-hidden />
            </Button>
            <div className="grid gap-1 sm:col-span-2">
              <label htmlFor={`rule-reason-${i}`} className="text-[11px] font-medium text-muted-foreground">Reason shown to the seller</label>
              <select id={`rule-reason-${i}`} value={rule.reasonCode} onChange={(e) => updateRule(i, { reasonCode: e.target.value as PolicyRule["reasonCode"] })} className="h-9 rounded-md border border-input bg-card px-2 text-xs">
                {REASON_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRule} className="justify-self-start"><Plus aria-hidden /> Add rule</Button>
      </fieldset>

      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
        {(error || (changed && validation)) && <FormMessage error={error ?? validation} />}
        <div className="grid gap-1">
          <label htmlFor="policy-note" className="text-sm font-medium">What changed and why</label>
          <Textarea id="policy-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
          Activate immediately (affects listings and messages published from now on)
        </label>
        <Button onClick={save} disabled={!changed || Boolean(validation) || note.trim().length < 3 || pending} className="justify-self-start">
          {pending ? "Saving…" : activate ? "Save and activate new version" : "Save as new version"}
        </Button>
      </div>
    </div>
  );
}

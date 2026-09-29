import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CountryFlag } from "@/components/common/CountryFlag";
import { ISO_COUNTRY_CODES, LAUNCH_COUNTRIES, countryName, placeTerms } from "@/lib/markets/countries";
import { REGION_CODES } from "@/lib/markets/regions";
import { cn } from "@/lib/utils";
import { useMarketLabel } from "./useMarketLabel";

interface Option {
  code: string;
  label: string;
  /** Extra search terms: English name, local abbreviations ("RD", "USA"), the code. */
  keywords: string[];
}

function useOptions(includeRegions: boolean) {
  const { i18n } = useTranslation("common");
  const label = useMarketLabel();
  return useMemo(() => {
    const aliasesByCountry = new Map<string, string[]>();
    for (const p of placeTerms()) {
      if (p.kind !== "name") continue;
      aliasesByCountry.set(p.country, [...(aliasesByCountry.get(p.country) ?? []), p.term]);
    }
    const country = (code: string): Option => ({
      code,
      label: label(code),
      keywords: [
        code,
        countryName(code, "en"),
        ...(aliasesByCountry.get(code) ?? []),
        ...(LAUNCH_COUNTRIES[code]?.locationCodes ?? []),
      ],
    });
    const collator = new Intl.Collator(i18n.language || "es");
    const regions: Option[] = includeRegions
      ? REGION_CODES.map((code) => ({ code, label: label(code), keywords: [code, "remote", "remoto"] }))
      : [];
    const suggested = Object.keys(LAUNCH_COUNTRIES).map(country);
    const all = ISO_COUNTRY_CODES.filter((c) => !LAUNCH_COUNTRIES[c])
      .map(country)
      .filter((o) => o.label !== o.code)
      .sort((a, b) => collator.compare(a.label, b.label));
    return { regions, suggested, all };
  }, [includeRegions, label, i18n.language]);
}

function OptionRow({ option, selected }: { option: Option; selected: boolean }) {
  return (
    <>
      <CountryFlag code={option.code} />
      <span className="flex-1 truncate">{option.label}</span>
      <Check aria-hidden="true" className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
    </>
  );
}

function OptionList({
  selected,
  includeRegions,
  onSelect,
}: {
  selected: string[];
  includeRegions: boolean;
  onSelect: (code: string) => void;
}) {
  const { t } = useTranslation("common");
  const { regions, suggested, all } = useOptions(includeRegions);
  const renderGroup = (heading: string, options: Option[]) =>
    options.length > 0 && (
      <CommandGroup heading={heading}>
        {options.map((o) => (
          <CommandItem
            key={o.code}
            value={`${o.code} ${o.label}`}
            keywords={o.keywords}
            onSelect={() => onSelect(o.code)}
            className="gap-2"
          >
            <OptionRow option={o} selected={selected.includes(o.code)} />
          </CommandItem>
        ))}
      </CommandGroup>
    );
  return (
    <Command>
      <CommandInput placeholder={t("markets.picker.search")} aria-label={t("markets.picker.search")} />
      <CommandList className="max-h-72">
        <CommandEmpty>{t("markets.picker.empty")}</CommandEmpty>
        {renderGroup(t("markets.picker.group_regions"), regions)}
        {renderGroup(t("markets.picker.group_suggested"), suggested)}
        {renderGroup(t("markets.picker.group_all"), all)}
      </CommandList>
    </Command>
  );
}

/**
 * Multi-select of target markets (countries + regions), shown as removable chips.
 * Searchable by localized name, English name, code and local abbreviations.
 */
export function MarketMultiPicker({
  value,
  onChange,
  id,
  includeRegions = true,
  allowEmpty = false,
  label: groupLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  /** Offer regions (LATAM, EU, remote worldwide…) besides countries. */
  includeRegions?: boolean;
  /** Target markets need at least one entry; citizenship lists may be empty. */
  allowEmpty?: boolean;
  /** Accessible name of the chip list. */
  label?: string;
}) {
  const { t } = useTranslation("common");
  const label = useMarketLabel();
  const [open, setOpen] = useState(false);
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={groupLabel ?? t("markets.header_chip")}>
          {value.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-1.5 rounded-full border bg-secondary py-0.5 pl-2 pr-1 text-xs text-secondary-foreground"
            >
              <CountryFlag code={code} />
              <span>{label(code)}</span>
              <button
                type="button"
                onClick={() => toggle(code)}
                disabled={!allowEmpty && value.length === 1}
                className="rounded-full p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                aria-label={t("markets.picker.remove", { name: label(code) })}
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" className="gap-1.5" aria-expanded={open}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t("markets.picker.placeholder")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <OptionList selected={value} includeRegions={includeRegions} onSelect={toggle} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Single country select (residence), searchable like {@link MarketMultiPicker}. */
export function CountrySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  const { t } = useTranslation("common");
  const label = useMarketLabel();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal sm:w-72"
        >
          <span className="flex items-center gap-2 truncate">
            {value ? (
              <>
                <CountryFlag code={value} />
                {label(value)}
              </>
            ) : (
              t("markets.picker.select_country")
            )}
          </span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <OptionList
          selected={value ? [value] : []}
          includeRegions={false}
          onSelect={(code) => {
            onChange(code);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

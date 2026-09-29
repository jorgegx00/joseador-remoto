import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { isRegionCode } from "@/lib/markets/regions";

// SVG flags (flag-icons, MIT). Windows never renders flag emoji — it shows "DO" —
// so emoji flags are not an option. URLs only: each file loads when first shown.
const FLAG_URLS = import.meta.glob("/node_modules/flag-icons/flags/4x3/*.svg", {
  eager: true,
  query: "?no-inline",
  import: "default",
}) as Record<string, string>;

function flagUrl(code: string): string | undefined {
  return FLAG_URLS[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];
}

/**
 * Decorative flag for a country code, or a globe for regions. Always paired with
 * the country name as text, so it is hidden from assistive technology.
 */
export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const url = isRegionCode(code) ? undefined : flagUrl(code);
  if (!url) {
    return <Globe aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)} />;
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={cn("h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-border", className)}
    />
  );
}

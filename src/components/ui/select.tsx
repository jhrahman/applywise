import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A custom listbox rather than a native <select>: native <option> elements
// can't be styled (no hover/selected treatment, no icons, no wrapping long
// labels) — the browser owns that popup entirely, on every platform
// differently. This keeps the exact same call-site shape callers already use
// (<Select value={} onChange={}>{'<option>'} children</Select>) so Setup.tsx
// didn't need to change, but renders and drives the popup itself.

interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
}
interface ParsedGroup {
  label: string;
  options: ParsedOption[];
}
type ParsedItem = { kind: "option"; option: ParsedOption } | { kind: "group"; group: ParsedGroup };

function labelFromChildren(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(labelFromChildren).join("");
  return "";
}

function parseOption(el: React.ReactElement): ParsedOption {
  const props = el.props as React.OptionHTMLAttributes<HTMLOptionElement>;
  return {
    value: String(props.value ?? ""),
    label: labelFromChildren(props.children),
    disabled: props.disabled,
  };
}

function parseChildren(children: React.ReactNode): ParsedItem[] {
  const items: ParsedItem[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      items.push({ kind: "option", option: parseOption(child) });
    } else if (child.type === "optgroup") {
      const props = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
      const options: ParsedOption[] = [];
      React.Children.forEach(props.children, (gc) => {
        if (React.isValidElement(gc) && gc.type === "option") options.push(parseOption(gc));
      });
      items.push({ kind: "group", group: { label: String(props.label ?? ""), options } });
    }
  });
  return items;
}

function flatten(items: ParsedItem[]): ParsedOption[] {
  return items.flatMap((i) => (i.kind === "option" ? [i.option] : i.group.options));
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  onChange?: (e: { target: { value: string } }) => void;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, children, value, onChange, disabled, id, "aria-label": ariaLabel }, ref) => {
    const items = React.useMemo(() => parseChildren(children), [children]);
    const flat = React.useMemo(() => flatten(items), [items]);
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const [dropUp, setDropUp] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const typeahead = React.useRef({ query: "", at: 0 });
    const reactId = React.useId();
    const listboxId = `${id ?? reactId}-listbox`;

    const selected = flat.find((o) => o.value === value);
    const currentValueStr = typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";

    // Close on outside click.
    React.useEffect(() => {
      if (!open) return;
      function onDocPointerDown(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
      }
      document.addEventListener("mousedown", onDocPointerDown);
      return () => document.removeEventListener("mousedown", onDocPointerDown);
    }, [open]);

    // On open: seed the active option from the current value, and flip the
    // panel above the trigger when there isn't enough room below (keeps it on
    // screen on short viewports / triggers near the bottom of the page).
    React.useEffect(() => {
      if (!open) return;
      const idx = flat.findIndex((o) => o.value === currentValueStr);
      setActiveIndex(idx >= 0 ? idx : 0);

      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setDropUp(spaceBelow < 260 && spaceAbove > spaceBelow);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    function commit(index: number) {
      const opt = flat[index];
      if (!opt || opt.disabled) return;
      onChange?.({ target: { value: opt.value } });
      setOpen(false);
    }

    function moveActive(delta: number) {
      if (flat.length === 0) return;
      setActiveIndex((prev) => {
        let next = prev;
        for (let step = 0; step < flat.length; step++) {
          next = (next + delta + flat.length) % flat.length;
          if (!flat[next].disabled) break;
        }
        return next;
      });
    }

    function onTriggerKeyDown(e: React.KeyboardEvent) {
      if (disabled) return;
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveActive(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          moveActive(-1);
          break;
        case "Home":
          e.preventDefault();
          setActiveIndex(flat.findIndex((o) => !o.disabled));
          break;
        case "End": {
          e.preventDefault();
          for (let i = flat.length - 1; i >= 0; i--) {
            if (!flat[i].disabled) {
              setActiveIndex(i);
              break;
            }
          }
          break;
        }
        case "Enter":
        case " ":
          e.preventDefault();
          commit(activeIndex);
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
        case "Tab":
          setOpen(false);
          break;
        default:
          if (e.key.length === 1) {
            const now = Date.now();
            const ta = typeahead.current;
            ta.query = now - ta.at < 500 ? ta.query + e.key : e.key;
            ta.at = now;
            const q = ta.query.toLowerCase();
            const idx = flat.findIndex((o) => o.label.toLowerCase().startsWith(q));
            if (idx >= 0) setActiveIndex(idx);
          }
      }
    }

    let optionCursor = -1;
    function renderOption(opt: ParsedOption) {
      optionCursor++;
      const index = optionCursor;
      const isSelected = opt.value === currentValueStr;
      const isActive = index === activeIndex;
      return (
        <div
          key={`${index}-${opt.value}`}
          id={`${listboxId}-opt-${index}`}
          data-index={index}
          role="option"
          aria-selected={isSelected}
          aria-disabled={opt.disabled}
          onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
          onClick={() => commit(index)}
          className={cn(
            "group flex cursor-pointer items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-sm leading-snug transition-colors duration-100",
            opt.disabled && "cursor-not-allowed opacity-40",
            !opt.disabled && isActive && "bg-accent-1/15",
            !opt.disabled && !isActive && "hover:bg-accent-1/8",
            isSelected && "text-accent-1"
          )}
        >
          <span className={cn(isSelected && "font-semibold")}>{opt.label}</span>
          {isSelected && <Check size={14} className="mt-0.5 shrink-0 text-accent-1" />}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="relative w-full">
        <button
          ref={ref}
          type="button"
          id={id}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 text-left text-sm text-[var(--fg)] outline-none transition-all duration-150",
            "hover:border-accent-1/60",
            "focus-visible:border-accent-1 focus-visible:ring-2 focus-visible:ring-accent-1/30",
            open && "border-accent-1 ring-2 ring-accent-1/30",
            disabled && "cursor-not-allowed opacity-50",
            className
          )}
        >
          <span className="truncate">{selected?.label ?? currentValueStr}</span>
          <ChevronDown
            size={15}
            className={cn(
              "shrink-0 text-[var(--fg-dim)] transition-transform duration-200",
              open && "rotate-180 text-accent-1"
            )}
          />
        </button>

        {open && (
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
            className={cn(
              "absolute z-50 max-h-72 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-1.5 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.4)] outline-none",
              dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
            )}
            style={{ animation: "select-pop 0.14s ease" }}
          >
            {items.length === 0 && (
              <div className="px-2.5 py-2 text-sm text-[var(--fg-dim)]">No options</div>
            )}
            {items.map((item, gi) =>
              item.kind === "option" ? (
                renderOption(item.option)
              ) : (
                <div key={`group-${gi}`} className="mt-1 first:mt-0">
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-dim)]">
                    {item.group.label}
                  </div>
                  {item.group.options.map((opt) => renderOption(opt))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import { Check, ChevronRight } from "lucide-react";
import { getFloatingHorizontalOffset, getFloatingVerticalPlacement } from "./floatingPlacement";

export type FigmaMenuOption = {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
};

type FigmaMenuProps = {
  label: string;
  value: string;
  options: readonly FigmaMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  triggerIcon?: ReactNode;
  triggerPrefix?: string;
};

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(
    target.closest("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")
  );
}

function FigmaMenu({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
  triggerIcon,
  triggerPrefix
}: FigmaMenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpenRef = useRef<"selected" | "last">("selected");
  const menuId = useId();
  const valueDescriptionId = `${menuId}-value`;
  const selected = options.find((option) => option.value === value);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = selected?.label || value || "暂无选项";

  useEffect(() => {
    if (!open) return;

    const updatePlacement = () => {
      const trigger = triggerRef.current;
      const popover = listboxRef.current;
      if (!trigger || !popover) return;

      setPlacement(getFloatingVerticalPlacement(rootRef.current || trigger, popover));
      setHorizontalOffset(getFloatingHorizontalOffset(rootRef.current || trigger, popover));
    };

    const frame = requestAnimationFrame(updatePlacement);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) setHorizontalOffset(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (!isInteractiveTarget(event.target)) {
          requestAnimationFrame(() => triggerRef.current?.focus());
        }
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const enabledOptions = Array.from(
        listboxRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || []
      );
      const target = focusOnOpenRef.current === "last"
        ? enabledOptions.at(-1)
        : enabledOptions.find((option) => option.getAttribute("aria-selected") === "true") || enabledOptions[0];
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const choose = (option: FigmaMenuOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setHorizontalOffset(0);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    focusOnOpenRef.current = event.key === "ArrowUp" ? "last" : "selected";
    setOpen(true);
  };

  const moveOptionFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const enabledOptions = Array.from(
      listboxRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || []
    );
    if (!enabledOptions.length) return;
    event.preventDefault();
    const activeIndex = enabledOptions.findIndex((option) => option === document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabledOptions.length - 1
        : event.key === "ArrowUp"
          ? Math.max(0, activeIndex <= 0 ? enabledOptions.length - 1 : activeIndex - 1)
          : activeIndex < 0 || activeIndex === enabledOptions.length - 1
            ? 0
            : activeIndex + 1;
    enabledOptions[nextIndex]?.focus();
  };

  return (
    <div ref={rootRef} className={`figma-menu ${className}`.trim()} data-open={open ? "true" : "false"}>
      <span className="figma-menu-label">{label}</span>
      <span id={valueDescriptionId} className="figma-visually-hidden">当前选择：{selectedLabel}</span>
      <button
        ref={triggerRef}
        type="button"
        className="figma-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-describedby={valueDescriptionId}
        disabled={disabled || options.length === 0}
        onClick={() => {
          focusOnOpenRef.current = "selected";
          setOpen((current) => !current);
        }}
        onKeyDown={openFromKeyboard}
      >
        <span className="figma-menu-trigger-value">
          {triggerIcon}
          <strong>{triggerPrefix ? `${triggerPrefix} · ${selectedLabel}` : selectedLabel}</strong>
        </span>
        <ChevronRight className="figma-menu-chevron" size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={listboxRef}
          id={menuId}
          className="figma-menu-popover"
          data-placement={placement}
          style={horizontalOffset ? { transform: `translateX(${horizontalOffset}px)` } : undefined}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={moveOptionFocus}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !rootRef.current?.contains(nextTarget)) {
              setOpen(false);
            }
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={option.value === value || (selectedIndex < 0 && index === 0) ? 0 : -1}
              disabled={option.disabled}
              className={option.value === value ? "active" : ""}
              onClick={() => choose(option)}
            >
              <span>
                <strong>{option.label}</strong>
                {option.detail ? <small>{option.detail}</small> : null}
              </span>
              {option.value === value
                ? <Check size={14} aria-hidden="true" />
                : <span className="figma-menu-option-mark" aria-hidden="true" />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default FigmaMenu;

"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

interface LabeledFieldProps {
  /** Visible label text. */
  label: string;
  /** Optional description below the label. */
  description?: string;
  /** Optional validation error message. */
  error?: string;
  /** Whether the field is required. */
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}

/**
 * Accessible labeled field wrapper.
 * Renders a <label> + description + error message with proper aria attrs.
 */
export function LabeledField({
  label,
  description,
  error,
  required,
  children,
  className,
}: LabeledFieldProps) {
  const autoId = useId();
  const descId = description ? `${autoId}-desc` : undefined;
  const errorId = error ? `${autoId}-err` : undefined;
  const describedBy = [descId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={autoId} className="text-sm font-medium text-fd-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </label>
      {description && (
        <p id={descId} className="text-xs text-fd-muted-foreground">
          {description}
        </p>
      )}
      {children({ id: autoId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Textarea variant ───────────────────────────────────────────────────────

interface LabeledTextareaProps extends Omit<ComponentProps<"textarea">, "id"> {
  label: string;
  description?: string;
  error?: string;
}

export function LabeledTextarea({
  label,
  description,
  error,
  className,
  ...props
}: LabeledTextareaProps) {
  return (
    <LabeledField label={label} description={description} error={error} required={props.required}>
      {(fieldProps) => (
        <textarea
          {...fieldProps}
          {...props}
          className={cn(
            "min-h-[120px] w-full resize-y rounded-lg border bg-fd-card px-3 py-2 font-mono text-sm transition-colors",
            "placeholder:text-fd-muted-foreground/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
            error
              ? "border-red-500/50 focus-visible:ring-red-500/30"
              : "border-fd-border",
            className,
          )}
        />
      )}
    </LabeledField>
  );
}

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InlineRateEditor({
  value,
  onSave,
  disabled,
  step = "0.0001",
  prefix = "$",
}: {
  value: number;
  onSave: (next: number) => void | Promise<void>;
  disabled?: boolean;
  step?: string;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      setTimeout(() => ref.current?.focus(), 10);
    }
  }, [editing, value]);

  const commit = async () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) { setEditing(false); return; }
    if (n === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(n);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        className="group inline-flex items-center gap-1 tabular-nums hover:underline disabled:opacity-50"
        disabled={disabled}
        title="Click to edit"
      >
        <span>{prefix}{Number(value).toFixed(4)}</span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Input
        ref={ref}
        type="number"
        step={step}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-24 text-xs"
        disabled={saving}
      />
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={commit} disabled={saving}>
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)} disabled={saving}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function InlineTextEditor({
  value,
  onSave,
  placeholder,
  disabled,
  className = "",
}: {
  value: string | null;
  onSave: (next: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? "");
      setTimeout(() => ref.current?.focus(), 10);
    }
  }, [editing, value]);

  const commit = async () => {
    const v = draft.trim();
    if (v === (value ?? "")) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(v);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        className={`group inline-flex items-center gap-1 hover:underline text-left ${className}`}
        disabled={disabled}
        title="Click to edit"
      >
        <span className={value ? "" : "text-muted-foreground italic"}>
          {value || placeholder || "—"}
        </span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 text-xs"
        disabled={saving}
        placeholder={placeholder}
      />
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={commit} disabled={saving}>
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)} disabled={saving}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

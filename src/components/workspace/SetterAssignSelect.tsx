import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSetters, setterKeys, type Setter } from "@/lib/setters";

type Props = {
  workspaceId?: string;
  value: string | null;
  onChange: (setterId: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const UNASSIGNED = "__unassigned__";

/** Per-chat assignment selector. Writes conversations.assigned_setter_id. */
export default function SetterAssignSelect({
  workspaceId, value, onChange, placeholder = "Assign…", className, disabled,
}: Props) {
  const { data: setters = [] } = useQuery({
    queryKey: setterKeys.list(workspaceId),
    queryFn: () => fetchSetters(workspaceId),
    enabled: !!workspaceId,
  });
  const active = setters.filter((s: Setter) => s.is_active || s.id === value);

  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {active.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.display_name}
            {s.external && <span className="text-muted-foreground text-xs ml-1">(external)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

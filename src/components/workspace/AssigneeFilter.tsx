import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSetters, setterKeys, type Setter } from "@/lib/setters";

type Props = {
  workspaceId?: string;
  value: string | "all" | "unassigned" | "mine" | null;
  onChange: (v: string | "all" | "unassigned" | "mine") => void;
  myUserId?: string | null;
  className?: string;
  includeAll?: boolean;
  includeUnassigned?: boolean;
  includeMine?: boolean;
};

/** Reusable assignee filter for Inbox / Pipeline. */
export default function AssigneeFilter({
  workspaceId, value, onChange, myUserId,
  className, includeAll = true, includeUnassigned = true, includeMine = true,
}: Props) {
  const { data: setters = [] } = useQuery({
    queryKey: setterKeys.list(workspaceId),
    queryFn: () => fetchSetters(workspaceId),
    enabled: !!workspaceId,
  });
  const active = setters.filter((s: Setter) => s.is_active);
  const haveMe = includeMine && myUserId && active.some((s) => s.linked_user_id === myUserId);

  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v as never)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="All setters" />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All setters</SelectItem>}
        {haveMe && <SelectItem value="mine">Only mine</SelectItem>}
        {includeUnassigned && <SelectItem value="unassigned">Unassigned</SelectItem>}
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

import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchWorkspaceMembers,
  memberDisplayName,
  workspaceMembersKey,
} from "@/lib/workspaceMembers";

type Props = {
  workspaceId?: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const UNASSIGNED = "__unassigned__";

export default function AssigneeSelect({ workspaceId, value, onChange, placeholder = "Unassigned", className, disabled }: Props) {
  const { data: members = [] } = useQuery({
    queryKey: workspaceMembersKey(workspaceId),
    queryFn: () => fetchWorkspaceMembers(workspaceId),
    enabled: !!workspaceId,
  });

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
        {members.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>
            {memberDisplayName(m)}
            <span className="text-muted-foreground text-xs ml-1">({m.role})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

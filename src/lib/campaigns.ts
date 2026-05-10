// Single source of truth for sibling-campaign grouping.
// Sibling campaigns launched across multiple WhatsApp numbers share a base name
// in the form "<base> :: <numberLabel>". Clients should see them merged into
// a single launch row.

export const SIBLING_SEP = " :: ";

export const splitBase = (full: string): { base: string; numberLabel: string | null } => {
  const idx = full.indexOf(SIBLING_SEP);
  if (idx === -1) return { base: full, numberLabel: null };
  return {
    base: full.slice(0, idx).trim(),
    numberLabel: full.slice(idx + SIBLING_SEP.length).trim() || null,
  };
};

/** Convenience when only the base name is needed. */
export const baseName = (full: string | null | undefined): string => splitBase(full ?? "").base;

// Pick the "most active" status across siblings.
export const statusRank: Record<string, number> = {
  running: 6, scheduled: 5, paused: 4, failed: 3, completed: 2, draft: 1,
};

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  whatsapp_number_id: string | null;
  template_id: string | null;
};

export type CampaignGroup = {
  key: string;
  displayName: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  template_id: string | null;
  whatsapp_number_ids: string[];
  campaigns: CampaignRow[];
};

export const groupCampaigns = (rows: CampaignRow[]): CampaignGroup[] => {
  const map = new Map<string, CampaignGroup>();
  for (const c of rows) {
    const { base } = splitBase(c.name);
    const key = base;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        displayName: base,
        status: c.status,
        total: 0,
        sent: 0,
        failed: 0,
        created_at: c.created_at,
        template_id: c.template_id,
        whatsapp_number_ids: [],
        campaigns: [],
      };
      map.set(key, g);
    }
    g.total += c.total_recipients ?? 0;
    g.sent += c.sent_count ?? 0;
    g.failed += c.failed_count ?? 0;
    if ((statusRank[c.status] ?? 0) > (statusRank[g.status] ?? 0)) g.status = c.status;
    if (c.created_at < g.created_at) g.created_at = c.created_at;
    if (c.whatsapp_number_id && !g.whatsapp_number_ids.includes(c.whatsapp_number_id)) {
      g.whatsapp_number_ids.push(c.whatsapp_number_id);
    }
    g.campaigns.push(c);
  }
  return Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

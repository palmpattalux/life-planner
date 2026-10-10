export type Phase = {
  id: string;
  title: string;
  focus: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
};

export type ItemKind = "goal" | "event";

export type Item = {
  id: string;
  phase_id: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  date: string | null;
  done: boolean;
  priority: boolean;
  created_at: string;
};

export type PhaseWithItems = Phase & { items: Item[] };

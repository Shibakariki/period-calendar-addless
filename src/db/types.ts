export type Cycle = {
  id: number;
  startDate: string;       // 'YYYY-MM-DD'
  endDate: string | null;
  notes: string | null;
};

export type NewCycle = Omit<Cycle, 'id'>;
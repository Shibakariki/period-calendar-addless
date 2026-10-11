export type Cycle = {
  id: number;
  startDate: string;       // 'YYYY-MM-DD'
  endDate: string | null;
  predictedCycleTime: number;
  isPredicted: boolean;
  notes: string | null;
};

export type NewCycle = Omit<Cycle, 'id'>;
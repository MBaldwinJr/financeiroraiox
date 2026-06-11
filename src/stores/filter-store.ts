import { create } from "zustand";

export interface DateRange {
  year: number;
  month: number | null; // null = ano inteiro
}

interface FilterStore {
  range: DateRange;
  categoryIds: string[];
  costCenterIds: string[];
  paymentMethods: string[];
  bankAccountIds: string[];
  partyIds: string[];
  setRange: (r: DateRange) => void;
  setMulti: (key: MultiKey, ids: string[]) => void;
  clear: () => void;
}

type MultiKey = "categoryIds" | "costCenterIds" | "paymentMethods" | "bankAccountIds" | "partyIds";

const now = new Date();
const defaultRange: DateRange = { year: now.getFullYear(), month: now.getMonth() + 1 };

export const useFilterStore = create<FilterStore>((set) => ({
  range: defaultRange,
  categoryIds: [],
  costCenterIds: [],
  paymentMethods: [],
  bankAccountIds: [],
  partyIds: [],
  setRange: (range) => set({ range }),
  setMulti: (key, ids) => set({ [key]: ids } as Pick<FilterStore, MultiKey>),
  clear: () =>
    set({
      range: defaultRange,
      categoryIds: [],
      costCenterIds: [],
      paymentMethods: [],
      bankAccountIds: [],
      partyIds: [],
    }),
}));

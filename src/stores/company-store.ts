import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CompanyStore {
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
}

export const useCompanyStore = create<CompanyStore>()(
  persist(
    (set) => ({
      activeCompanyId: null,
      setActiveCompanyId: (id) => set({ activeCompanyId: id }),
    }),
    { name: "fvp-active-company" },
  ),
);

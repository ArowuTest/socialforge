import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  composeDrawerOpen: boolean;
  notificationsOpen: boolean;
  selectedCalendarDate: Date | null;
  calendarViewMode: "month" | "week" | "list";

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setComposeDrawerOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setSelectedCalendarDate: (date: Date | null) => void;
  setCalendarViewMode: (mode: "month" | "week" | "list") => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  composeDrawerOpen: false,
  notificationsOpen: false,
  selectedCalendarDate: null,
  calendarViewMode: "month",

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setComposeDrawerOpen: (open) => set({ composeDrawerOpen: open }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setSelectedCalendarDate: (date) => set({ selectedCalendarDate: date }),
  setCalendarViewMode: (mode) => set({ calendarViewMode: mode }),
}));

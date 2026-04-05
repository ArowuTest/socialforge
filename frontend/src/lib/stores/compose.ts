import { create } from "zustand";
import { Platform, PostType } from "@/types";

interface MediaFile {
  id: string;
  url: string;
  type: "image" | "video";
  file?: File;
  thumbnailUrl?: string;
}

interface ComposeState {
  caption: string;
  selectedPlatforms: Platform[];
  media: MediaFile[];
  postType: PostType;
  scheduledAt: string | null;
  useNextSlot: boolean;
  isPublishing: boolean;
  isDraft: boolean;

  // Actions
  setCaption: (caption: string) => void;
  togglePlatform: (platform: Platform) => void;
  setSelectedPlatforms: (platforms: Platform[]) => void;
  addMedia: (media: MediaFile) => void;
  removeMedia: (id: string) => void;
  setPostType: (type: PostType) => void;
  setScheduledAt: (date: string | null) => void;
  setUseNextSlot: (value: boolean) => void;
  setIsPublishing: (value: boolean) => void;
  reset: () => void;
}

const defaultState = {
  caption: "",
  selectedPlatforms: [] as Platform[],
  media: [] as MediaFile[],
  postType: PostType.POST,
  scheduledAt: null,
  useNextSlot: false,
  isPublishing: false,
  isDraft: false,
};

export const useComposeStore = create<ComposeState>((set) => ({
  ...defaultState,

  setCaption: (caption) => set({ caption }),

  togglePlatform: (platform) =>
    set((state) => ({
      selectedPlatforms: state.selectedPlatforms.includes(platform)
        ? state.selectedPlatforms.filter((p) => p !== platform)
        : [...state.selectedPlatforms, platform],
    })),

  setSelectedPlatforms: (platforms) => set({ selectedPlatforms: platforms }),

  addMedia: (media) =>
    set((state) => ({ media: [...state.media, media] })),

  removeMedia: (id) =>
    set((state) => ({ media: state.media.filter((m) => m.id !== id) })),

  setPostType: (postType) => set({ postType }),

  setScheduledAt: (scheduledAt) => set({ scheduledAt }),

  setUseNextSlot: (useNextSlot) => set({ useNextSlot }),

  setIsPublishing: (isPublishing) => set({ isPublishing }),

  reset: () => set(defaultState),
}));

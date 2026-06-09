import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UserMeResponse } from "@psico/types";

vi.mock("@/actions/profile", () => ({
  updateProfileAction: vi.fn().mockResolvedValue({}),
}));

import { updateProfileAction } from "@/actions/profile";
import { EditProfileCard } from "./EditProfileCard";

function buildMe(
  overrides: Partial<UserMeResponse["user"]> = {},
): UserMeResponse {
  return {
    user: {
      id: "u1",
      firstName: "Ana",
      email: "ana@example.com",
      city: "Quito",
      country: "EC",
      timezone: null,
      tier: "free",
      joinedAt: new Date("2026-01-01"),
      initials: "A",
      avatarUrl: null,
      mood: null,
      ...overrides,
    },
    stats: {
      daysActive: 0,
      booksCompleted: 0,
      chaptersRead: 0,
      diaryEntries: 0,
      minutesTotal: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
<<<<<<< HEAD
=======
<<<<<<< HEAD
=======
      entriesThisWeek: 0,
>>>>>>> origin/main
>>>>>>> origin/main
    },
    achievements: [],
    preferences: {
      voicePreference: "none",
      moodPrompts: true,
      bestTime: "any",
      weeklyGoalMinutes: 60,
      theme: "system",
      language: "es-419",
    },
    readerPreferences: {
      theme: "sepia",
      font: "serif",
      fontSize: 16,
      lineHeight: 1.5,
    },
    notifications: {
      dailyReminder: true,
      reminderTime: "20:00",
      streakReminders: true,
      ecoReplies: true,
      terapiaReminders: true,
      weeklyReport: true,
    },
    privacy: {
      shareDiaryWithTherapist: false,
      anonymizedAnalytics: true,
      marketingEmail: false,
      dataExportRequested: null,
      accountDeleteRequested: null,
    },
    cryptoSalt: null,
    cryptoSeedShownAt: null,
    onboardingState: null,
  } as UserMeResponse;
}

describe("EditProfileCard", () => {
  beforeEach(() => {
    vi.mocked(updateProfileAction).mockClear();
    vi.mocked(updateProfileAction).mockResolvedValue({} as UserMeResponse);
  });

  it("renders the user's current fields", () => {
    render(<EditProfileCard me={buildMe()} />);
    expect(screen.getByDisplayValue("Ana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Quito")).toBeInTheDocument();
    expect(screen.getByDisplayValue("EC")).toBeInTheDocument();
  });

  it("save button is disabled when nothing changed", () => {
    render(<EditProfileCard me={buildMe()} />);
    expect(screen.getByText("Guardar")).toBeDisabled();
  });

  it("submits the updated fields when the user clicks Save", async () => {
    render(<EditProfileCard me={buildMe()} />);
    fireEvent.change(screen.getByDisplayValue("Ana"), {
      target: { value: "Anna" },
    });
    fireEvent.click(screen.getByText("Guardar"));
    await waitFor(() => {
      expect(updateProfileAction).toHaveBeenCalledWith({
        firstName: "Anna",
        city: "Quito",
        country: "EC",
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Datos guardados")).toBeInTheDocument(),
    );
  });

  it("shows inline error when the server action throws", async () => {
    vi.mocked(updateProfileAction).mockRejectedValueOnce(new Error("boom"));
    render(<EditProfileCard me={buildMe()} />);
    fireEvent.change(screen.getByDisplayValue("Ana"), {
      target: { value: "Anna" },
    });
    fireEvent.click(screen.getByText("Guardar"));
    expect(await screen.findByText(/No pudimos guardar/)).toBeInTheDocument();
  });
});

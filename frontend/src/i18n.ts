import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import SettingsService from "@/services/SettingsService";

export async function initI18n() {
  let schoolName = "School Name";

  try {
    const school = await SettingsService.getSettings();
    if (school?.school_name) {
      schoolName = school.school_name; // ✅ FIXED
    }
  } catch (error) {
    console.warn("Failed to load school name, using default");
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: {
          translation: {
            login: {
              title: `Login - ${schoolName}`,
              success: "Login successful!",
              error: "Login failed. Please try again.",
            },
          },
        },
      },
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
    });

  return i18n;
}

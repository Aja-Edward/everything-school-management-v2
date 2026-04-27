import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import SettingsService from "@/services/SettingsService";

// ─── Supported languages ────────────────────────────────────────────────────

export type SupportedLanguage = "en" | "fr" | "es" | "de" | "nl" | "zh" | "ar";

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  nl: "Nederlands",
  zh: "中文",
  ar: "العربية",
};

// ─── Translation resources ───────────────────────────────────────────────────

const resources = {
  en: {
    translation: {
      login: {
        title: "Login - {{schoolName}}",
        success: "Login successful!",
        error: "Login failed. Please try again.",
      },
      settings: {
        school_name: "School Name",
        site_name: "Site Name",
        enter_school_name: "Enter school name",
        enter_site_name: "Enter site name",
      },
    },
  },
  fr: {
    translation: {
      login: {
        title: "Connexion - {{schoolName}}",
        success: "Connexion réussie !",
        error: "Échec de la connexion.",
      },
      settings: {
        school_name: "Nom de l'école",
        site_name: "Nom du site",
        enter_school_name: "Entrez le nom de l'école",
        enter_site_name: "Entrez le nom du site",
      },
    },
  },
  es: {
    translation: {
      login: {
        title: "Iniciar sesión - {{schoolName}}",
        success: "¡Inicio de sesión exitoso!",
        error: "Error al iniciar sesión.",
      },
      settings: {
        school_name: "Nombre de la escuela",
        site_name: "Nombre del sitio",
        enter_school_name: "Ingrese el nombre de la escuela",
        enter_site_name: "Ingrese el nombre del sitio",
      },
    },
  },
  de: {
    translation: {
      login: {
        title: "Anmeldung - {{schoolName}}",
        success: "Anmeldung erfolgreich!",
        error: "Anmeldung fehlgeschlagen.",
      },
      settings: {
        school_name: "Name der Schule",
        site_name: "Name der Seite",
        enter_school_name: "Geben Sie den Namen der Schule ein",
        enter_site_name: "Geben Sie den Namen der Seite ein",
      },
    },
  },
  nl: {
    translation: {
      login: {
        title: "Inloggen - {{schoolName}}",
        success: "Succesvol ingelogd!",
        error: "Inloggen mislukt.",
      },
      settings: {
        school_name: "Naam van de school",
        site_name: "Naam van de site",
        enter_school_name: "Voer de naam van de school in",
        enter_site_name: "Voer de naam van de site in",
      },
    },
  },
  zh: {
    translation: {
      login: {
        title: "登录 - {{schoolName}}",
        success: "登录成功！",
        error: "登录失败。",
      },
      settings: {
        school_name: "学校名称",
        site_name: "网站名称",
        enter_school_name: "请输入学校名称",
        enter_site_name: "请输入网站名称",
      },
    },
  },
  ar: {
    translation: {
      login: {
        title: "تسجيل الدخول - {{schoolName}}",
        success: "تم تسجيل الدخول بنجاح!",
        error: "فشل تسجيل الدخول.",
      },
      settings: {
        school_name: "اسم المدرسة",
        site_name: "اسم الموقع",
        enter_school_name: "أدخل اسم المدرسة",
        enter_site_name: "أدخل اسم الموقع",
      },
    },
  },
};

// ─── Core init — no API calls, safe to run before auth ──────────────────────

/**
 * Initialise i18next with static resources only.
 * Call this once at app bootstrap — it never touches the API.
 */
export async function initI18n() {
  if (i18n.isInitialized) return i18n;

  await i18n.use(initReactI18next).init({
    resources,
    lng: localStorage.getItem("lang") || "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
      // Global default so {{schoolName}} renders gracefully before loadSchoolContext() runs
      defaultVariables: { schoolName: "School" },
    },
  });

  return i18n;
}

// ─── Post-login context loader ───────────────────────────────────────────────

/**
 * Fetch school settings and inject them as i18n default variables.
 * Call this AFTER a successful login — never at bootstrap.
 *
 * Usage:
 *   const { login } = useAuth();
 *   await login(credentials);
 *   await loadSchoolContext();
 */
export async function loadSchoolContext(): Promise<void> {
  try {
    const school = await SettingsService.getSettings();

    if (school?.school_name) {
      // Merge into the interpolation defaults so every key that uses
      // {{schoolName}} picks it up automatically — no per-component plumbing.
      i18n.options.interpolation = {
        ...i18n.options.interpolation,
        defaultVariables: {
          ...(i18n.options.interpolation?.defaultVariables ?? {}),
          schoolName: school.school_name,
        },
      };

      // Force a re-render on all subscribed components
      i18n.emit("languageChanged", i18n.language);
    }
  } catch {
    // Non-fatal — the defaultVariable fallback ("School") keeps the UI intact
    console.warn("[i18n] Could not load school context, using default name");
  }
}

// ─── Language helpers ────────────────────────────────────────────────────────

/**
 * Change the active language and persist the choice.
 */
export function setLanguage(lang: SupportedLanguage): Promise<void> {
  localStorage.setItem("lang", lang);
  return i18n.changeLanguage(lang) as unknown as Promise<void>;
}

/**
 * Returns the current language code.
 */
export function getCurrentLanguage(): SupportedLanguage {
  return (i18n.language as SupportedLanguage) || "en";
}

export default i18n;
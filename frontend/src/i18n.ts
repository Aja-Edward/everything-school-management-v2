import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import SettingsService from "@/services/SettingsService";

export async function initI18n() {
  let schoolName = "School Name";

  try {
    const school = await SettingsService.getSettings();
    if (school?.school_name) {
      schoolName = school.school_name;
    }
  } catch (error) {
    console.warn("Failed to load school name, using default");
  }

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

  await i18n.use(initReactI18next).init({
    resources,
    lng: localStorage.getItem("lang") || "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

  return i18n;
}
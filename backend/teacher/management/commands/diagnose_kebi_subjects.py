"""
Temporary diagnostic command — outputs Kebi International Academy subject data
to stdout so it appears in the Render build log.
Remove this file after diagnosis is complete.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Diagnose Kebi International Academy subject configuration (temporary)."

    def handle(self, *args, **options):
        try:
            from tenants.models import Tenant
            from subject.models import Subject
            from academics.models import EducationLevel

            tenant = Tenant.objects.filter(slug='kebi-international-academy').first()
            if not tenant:
                self.stdout.write(self.style.ERROR("Tenant 'kebi-international-academy' NOT FOUND"))
                all_tenants = list(Tenant.objects.values_list('slug', flat=True))
                self.stdout.write(f"  Available slugs: {all_tenants}")
                return

            self.stdout.write(self.style.SUCCESS(f"\nTenant: {tenant.name} ({tenant.slug})"))
            self.stdout.write("=" * 70)

            # ── Education Levels ──────────────────────────────────────────────
            self.stdout.write("\n=== EDUCATION LEVELS ===")
            els = EducationLevel.objects.filter(tenant=tenant).order_by('display_order')
            self.stdout.write(f"Count: {els.count()}")
            for el in els:
                self.stdout.write(
                    f"  ID:{el.id} | name:{el.name} | code:{el.code} "
                    f"| level_type:{el.level_type!r} | active:{el.is_active}"
                )

            # ── Subjects summary ──────────────────────────────────────────────
            self.stdout.write("\n=== SUBJECTS SUMMARY ===")
            all_subjects = Subject.objects.filter(tenant=tenant)
            null_tenant_subjects = Subject.objects.filter(
                tenant__isnull=True,
                grade_levels__education_level__tenant=tenant
            ).distinct()

            self.stdout.write(f"Subjects with tenant=Kebi:  {all_subjects.count()}")
            self.stdout.write(f"Subjects with null tenant (but linked to Kebi grade_levels): {null_tenant_subjects.count()}")
            self.stdout.write(f"Total subject records (all tenants): {Subject.objects.count()}")

            # ── Subjects with their education_levels JSON ─────────────────────
            self.stdout.write("\n=== SUBJECTS (name | education_levels JSON | grade_levels count) ===")
            # Also write to stderr so it's visible regardless of scroll position
            self.stderr.write("SUBJECT DATA START >>>")
            for s in all_subjects.order_by('name'):
                gl_count = s.grade_levels.count()
                gl_names = list(
                    s.grade_levels.select_related('education_level')
                    .values_list('education_level__name', flat=True)
                )[:3]
                line = (
                    f"  {s.name!r:45} | edu_json={s.education_levels!s:35} "
                    f"| grade_levels={gl_count} {gl_names}"
                )
                self.stdout.write(line)
                self.stderr.write(line)
            self.stderr.write("SUBJECT DATA END <<<")

            # ── Filter test ───────────────────────────────────────────────────
            self.stdout.write("\n=== FILTER RESULTS (education_levels icontains) ===")
            from django.db.models import Q
            for level in ['JUNIOR_SECONDARY', 'SENIOR_SECONDARY', 'PRIMARY', 'NURSERY']:
                qs = Subject.objects.filter(
                    tenant=tenant,
                ).filter(
                    Q(grade_levels__education_level__level_type__iexact=level)
                    | Q(grade_levels__education_level__name__icontains=level)
                    | Q(grade_levels__education_level__code__iexact=level)
                    | Q(education_levels__icontains=level)
                ).distinct()
                names = list(qs.values_list('name', flat=True)[:5])
                self.stdout.write(f"  {level}: {qs.count()} subjects — samples: {names}")

            # ── Teachers and their levels ─────────────────────────────────────
            self.stdout.write("\n=== TEACHING STAFF & THEIR EDUCATION LEVELS ===")
            from teacher.models import Teacher
            teachers = Teacher.objects.filter(tenant=tenant, staff_type='teaching').select_related('user').prefetch_related('education_levels')
            for t in teachers:
                el_names = [el.name for el in t.education_levels.all()]
                self.stdout.write(
                    f"  {t.user.get_full_name()!r:35} | level={t.level!r:30} | M2M={el_names}"
                )

            # ── Academic settings ─────────────────────────────────────────────
            self.stdout.write("\n=== TEACHING MODEL SETTINGS ===")
            try:
                # Try multiple possible app/model names
                settings_obj = None
                for app_path in [
                    'schoolSettings.models.SchoolSettings',
                    'school_settings.models.SchoolSettings',
                    'tenants.models.TenantSettings',
                ]:
                    try:
                        from django.apps import apps as django_apps
                        app_label, model_name = app_path.rsplit('.', 2)[-2:]
                        app_label_short = app_path.split('.')[0]
                        model = django_apps.get_model(app_label_short, model_name)
                        settings_obj = model.objects.filter(tenant=tenant).first()
                        if settings_obj:
                            self.stdout.write(f"  Found via: {app_path}")
                            break
                    except Exception:
                        continue

                if settings_obj:
                    for field in [
                        'nursery_use_subject_teachers',
                        'primary_use_subject_teachers',
                        'junior_secondary_use_subject_teachers',
                        'senior_secondary_use_subject_teachers',
                    ]:
                        val = getattr(settings_obj, field, 'N/A (field missing)')
                        self.stdout.write(f"  {field}: {val}")
                    # Show all fields to help find the right one
                    all_fields = [f.name for f in settings_obj._meta.get_fields()
                                  if 'subject' in f.name.lower() or 'teach' in f.name.lower()]
                    if all_fields:
                        self.stdout.write(f"  [All teaching-related fields]: {all_fields}")
                else:
                    self.stdout.write("  No settings record found. Listing all installed apps with 'setting' in name:")
                    from django.apps import apps as django_apps
                    setting_apps = [a.label for a in django_apps.get_app_configs()
                                    if 'setting' in a.label.lower()]
                    self.stdout.write(f"  {setting_apps}")
            except Exception as e:
                self.stdout.write(f"  Error: {e}")

            self.stdout.write("\n" + "=" * 70)
            self.stdout.write(self.style.SUCCESS("Diagnosis complete."))

        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Diagnosis failed: {exc}"))
            import traceback
            self.stderr.write(traceback.format_exc())

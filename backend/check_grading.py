from tenants.models import Tenant
from result.models import GradingSystem, NurseryResult

t = Tenant.objects.filter(name__icontains="kebi").first()

if not t:
    print("No tenant found matching 'kebi'.")
else:
    print(f"Tenant: {t.id} | {t.name}\n")
    print("── Grading Systems ──────────────────────────")
    for gs in GradingSystem.objects.filter(tenant=t):
        print(f"\n{gs.name}  (type={gs.grading_type}, pass_mark={gs.pass_mark})")
        for g in gs.grades.order_by('-min_score'):
            print(
                f"  {g.grade}: {g.min_score}-{g.max_score}  point={g.grade_point}  passing={g.is_passing}")

    print("\n── Zoe's Subject -> Grading System mapping ───")
    zoe_results = NurseryResult.objects.filter(
        student__user__first_name__icontains="Zoe", tenant=t
    ).select_related("grading_system", "subject")

    if not zoe_results.exists():
        print("No NurseryResult rows found for a student named Zoe under this tenant.")
    else:
        systems_used = set()
        for r in zoe_results:
            gs_name = r.grading_system.name if r.grading_system else "None"
            systems_used.add(gs_name)
            print(f"  {r.subject.name} -> {gs_name}")

        print(f"\nDistinct grading systems in use: {systems_used}")
        if len(systems_used) <= 1:
            print("Consistent (one system for all subjects).")
        else:
            print("INCONSISTENT - multiple grading systems across subjects.")

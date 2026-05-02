from django.http import HttpResponse

MAIN_DOMAINS = {'nuventacloud.com', 'www.nuventacloud.com'}

MAIN_PLATFORM_PAGES = [
    {'loc': '/', 'priority': '1.0', 'changefreq': 'weekly'},
    {'loc': '/about', 'priority': '0.8', 'changefreq': 'monthly'},
    {'loc': '/school_activities', 'priority': '0.7', 'changefreq': 'monthly'},
    {'loc': '/how-to-apply', 'priority': '0.7', 'changefreq': 'monthly'},
    {'loc': '/onboarding/register', 'priority': '0.6', 'changefreq': 'monthly'},
]

TENANT_PUBLIC_PAGES = [
    {'loc': '/', 'priority': '1.0', 'changefreq': 'weekly'},
    {'loc': '/admissions', 'priority': '0.9', 'changefreq': 'weekly'},
    {'loc': '/about', 'priority': '0.8', 'changefreq': 'monthly'},
    {'loc': '/contact', 'priority': '0.7', 'changefreq': 'monthly'},
    {'loc': '/school_activities', 'priority': '0.7', 'changefreq': 'monthly'},
]


def _get_request_host(request):
    """Get the real host, preferring X-Forwarded-Host set by Vercel proxy."""
    host = (
        request.META.get('HTTP_X_FORWARDED_HOST', '')
        or request.get_host()
    )
    return host.split(':')[0].strip().lower()


def _build_sitemap_xml(base_url, pages):
    entries = '\n'.join(
        f'  <url>\n'
        f'    <loc>{base_url}{p["loc"]}</loc>\n'
        f'    <changefreq>{p["changefreq"]}</changefreq>\n'
        f'    <priority>{p["priority"]}</priority>\n'
        f'  </url>'
        for p in pages
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{entries}\n'
        '</urlset>'
    )


def sitemap_view(request):
    from tenants.models import Tenant

    host = _get_request_host(request)
    base_url = f'https://{host}'

    if host in MAIN_DOMAINS:
        return HttpResponse(
            _build_sitemap_xml(base_url, MAIN_PLATFORM_PAGES),
            content_type='application/xml',
        )

    # Strip www. for custom domain lookup (DB stores apex domain)
    lookup_domain = host[4:] if host.startswith('www.') else host

    tenant_exists = Tenant.objects.filter(
        custom_domain=lookup_domain,
        custom_domain_verified=True,
        is_active=True,
        status='active',
    ).exists()

    pages = TENANT_PUBLIC_PAGES if tenant_exists else TENANT_PUBLIC_PAGES
    return HttpResponse(
        _build_sitemap_xml(base_url, pages),
        content_type='application/xml',
    )


def robots_txt_view(request):
    host = _get_request_host(request)
    content = f'User-agent: *\nAllow: /\nSitemap: https://{host}/sitemap.xml\n'
    return HttpResponse(content, content_type='text/plain')

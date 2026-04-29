import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage } from '@/services/LandingPageService';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import TenantFooter from '@/components/tenant/TenantFooter';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import api from '@/services/api';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';

interface ActivityEvent {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  event_type: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  is_published: boolean;
  display_type: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const TenantSchoolActivitiesPage: React.FC = () => {
  const { tenant, settings } = useTenant();
  const [landing, setLanding] = useState<TenantLandingPage | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [ribbonText, setRibbonText] = useState<string | null>(null);
  const [ribbonSpeed, setRibbonSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  const primaryColor = settings?.primary_color || '#1e40af';

  useEffect(() => {
    Promise.all([
      LandingPageService.getPublic().catch(() => null),
      api.get('/events/events/?is_active=true&is_published=true').catch(() => ({ results: [] })),
    ]).then(([landingData, eventsData]) => {
      if (landingData) {
        setLanding(landingData);
        if (landingData.ribbon_enabled && landingData.ribbon_text) {
          setRibbonText(landingData.ribbon_text);
          setRibbonSpeed(landingData.ribbon_speed ?? 'medium');
        }
      }
      const evts: ActivityEvent[] = eventsData?.results ?? eventsData ?? [];
      const published = evts.filter(e => e.is_active && e.is_published);
      const ribbonEvt = published.find(e => e.display_type === 'ribbon');
      if (ribbonEvt) {
        setRibbonText(ribbonEvt.title);
        setRibbonSpeed('medium');
      }
      setActivities(published.filter(e => e.display_type !== 'ribbon'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {ribbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
        </div>
      )}
      <div className={ribbonText ? 'pt-8' : ''}>
        <TenantNavbar
          schoolName={tenant?.name ?? ''}
          logo={settings?.logo}
          primaryColor={primaryColor}
          navLinks={landing?.nav_links ?? []}
          portalLabel="Portal Login"
        />
      </div>

      {/* Page header */}
      <div className="pt-28 pb-14 px-4 sm:px-6 lg:px-8"
        style={{ background: `linear-gradient(135deg, ${primaryColor}14 0%, #f1f5f9 100%)` }}>
        <div className="max-w-7xl mx-auto">
          <Link to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            School Activities
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl leading-relaxed">
            Explore events, achievements, and activities happening at{' '}
            <span className="font-semibold text-gray-700">{tenant?.name}</span>.
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-9 h-9 border-[3px] border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${primaryColor} transparent transparent transparent` }} />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${primaryColor}14` }}>
              <Calendar className="w-10 h-10" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">No activities yet</h2>
            <p className="text-gray-400 max-w-sm mx-auto leading-relaxed">
              Upcoming events and school activities will appear here. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {activities.map(activity => (
              <article
                key={activity.id}
                className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
              >
                {/* Card image */}
                {activity.image ? (
                  <img
                    src={activity.image}
                    alt={activity.title}
                    className="w-full h-52 object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-52 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}18, ${primaryColor}35)` }}
                  >
                    <Calendar className="w-12 h-12 opacity-30" style={{ color: primaryColor }} />
                  </div>
                )}

                {/* Card body */}
                <div className="flex flex-col flex-1 p-6">
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${primaryColor}14`, color: primaryColor }}
                    >
                      <Tag className="w-3 h-3" />
                      {formatEventType(activity.event_type)}
                    </span>
                    {activity.start_date && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">
                        <Calendar className="w-3 h-3" />
                        {formatDate(activity.start_date)}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5 leading-snug">
                    {activity.title}
                  </h3>

                  {/* Subtitle */}
                  {activity.subtitle && (
                    <p className="text-sm font-medium text-gray-500 mb-2">
                      {activity.subtitle}
                    </p>
                  )}

                  {/* Description */}
                  {activity.description && (
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mt-auto pt-3 border-t border-gray-50">
                      {activity.description}
                    </p>
                  )}

                  {/* End date badge */}
                  {activity.end_date && activity.end_date !== activity.start_date && (
                    <p className="text-xs text-gray-400 mt-3">
                      Ends {formatDate(activity.end_date)}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {landing && (
        <TenantFooter
          landing={landing}
          schoolName={tenant?.name ?? ''}
          logo={settings?.logo}
          primaryColor={primaryColor}
          contactSection={landing.sections.find(s => s.section_type === 'contact' && s.is_enabled)}
        />
      )}
    </div>
  );
};

export default TenantSchoolActivitiesPage;

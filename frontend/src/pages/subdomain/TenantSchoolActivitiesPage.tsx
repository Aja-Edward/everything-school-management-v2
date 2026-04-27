import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage } from '@/services/LandingPageService';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import TenantFooter from '@/components/tenant/TenantFooter';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import api from '@/services/api';
import { ArrowLeft, Calendar, Image as ImageIcon } from 'lucide-react';

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
      // Event ribbon overrides landing ribbon
      const ribbonEvt = published.find(e => e.display_type === 'ribbon');
      if (ribbonEvt) {
        setRibbonText(ribbonEvt.title);
        setRibbonSpeed('medium');
      }
      // Show event/achievement/custom events as activities
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
      <div
        className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
        style={{ background: `linear-gradient(135deg, ${primaryColor}12 0%, #f8fafc 100%)` }}
      >
        <div className="max-w-7xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
            School Activities
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl">
            Explore the events, achievements, and activities happening at {tenant?.name}.
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: primaryColor }} />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-24">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${primaryColor}18` }}
            >
              <Calendar className="w-8 h-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No activities yet</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Check back soon — upcoming events and school activities will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {activities.map(activity => (
              <div
                key={activity.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {activity.image ? (
                  <img
                    src={activity.image}
                    alt={activity.title}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-48 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}44)` }}
                  >
                    <ImageIcon className="w-10 h-10 opacity-40" style={{ color: primaryColor }} />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      {activity.event_type.replace('_', ' ')}
                    </span>
                    {activity.start_date && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(activity.start_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{activity.title}</h3>
                  {activity.subtitle && (
                    <p className="text-sm text-gray-500 mb-2">{activity.subtitle}</p>
                  )}
                  {activity.description && (
                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                      {activity.description}
                    </p>
                  )}
                </div>
              </div>
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

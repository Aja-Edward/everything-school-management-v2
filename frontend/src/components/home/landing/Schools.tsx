import React, { useEffect, useState } from 'react';
import api from '@/services/api';

interface School { name: string; slug: string; logo: string; }

// Every active school that has uploaded a logo, in the order they joined
// (GET /api/tenants/showcase/). A platform admin can hide one from the school
// list. Nothing here needs editing when a school joins.

// Hand-cleaned copies of logos whose upload has a flaw (a stray Instagram
// icon, a white box behind a round logo). Each is tied to the upload version
// it was made from, so a school that uploads a new logo shows the new one.
const CLEANED: Record<string, { version: string; file: string }> = {
  'kebi-international-academy': { version: 'v1777554792', file: '/images/schools/kebi-international-academy.webp' },
  'al-qolamul-muwaffaq': { version: 'v1791398674', file: '/images/schools/al-qolamul-muwaffaq.webp' },
};

const logoFor = (s: School) => {
  const cleaned = CLEANED[s.slug];
  return cleaned && s.logo.includes(`/${cleaned.version}/`) ? cleaned.file : s.logo;
};

// One pass of the list has to be wider than a wide screen for the loop to
// look seamless, so a short list repeats until it has about a dozen tiles.
const TILES_PER_RUN = 12;

const Tile: React.FC<{ school: School; hidden: boolean }> = ({ school, hidden }) => (
  <li
    aria-hidden={hidden || undefined}
    className="shrink-0 w-48 h-28 flex items-center justify-center rounded-xl bg-white dark:bg-gray-300 border border-gray-200 dark:border-gray-700 px-5"
    title={school.name}
  >
    <img src={logoFor(school)} alt={hidden ? '' : school.name} loading="lazy" className="max-h-20 max-w-full object-contain" />
  </li>
);

const Schools: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    api.get('/api/tenants/showcase/')
      .then((res: School[]) => setSchools(Array.isArray(res) ? res : []))
      .catch(() => setSchools([]));
  }, []);

  if (schools.length === 0) return null;

  // The track holds the run twice and slides by half its width, which loops
  // without a jump. Only the first copy of each school is read aloud.
  const run = Array.from({ length: Math.ceil(TILES_PER_RUN / schools.length) }, () => schools).flat();

  return (
    <section className="bg-white dark:bg-gray-950 py-12 border-b border-gray-100 dark:border-gray-900" aria-labelledby="schools-title">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="schools-title" className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest uppercase">
          Schools already running on Nuventa Cloud
        </h2>
      </div>

      <div className="group relative mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <ul className="flex w-max gap-6 animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {run.map((s, i) => <Tile key={`a${i}`} school={s} hidden={i >= schools.length} />)}
          {run.map((s, i) => <Tile key={`b${i}`} school={s} hidden />)}
        </ul>
      </div>
    </section>
  );
};

export default Schools;

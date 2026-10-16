import React from 'react';

// Schools running on Nuventa Cloud, shown with their permission. Logos live in
// public/images/schools as trimmed transparent WebP, 200px tall.
const SCHOOLS = [
  { name: 'Kebi International Academy', logo: '/images/schools/kebi-international-academy.webp' },
  { name: "God's Treasure Schools", logo: '/images/schools/gods-treasure-schools.webp' },
  { name: 'Al-Qolamul Muwaffaq International School', logo: '/images/schools/al-qolamul-muwaffaq.webp' },
];

// With only a few schools, one pass of the list is narrower than a wide
// screen, so it repeats until it is; the track then holds that run twice and
// slides by half its width, which loops without a jump.
const RUN = Array.from({ length: 4 }, () => SCHOOLS).flat();

const Tile: React.FC<{ school: (typeof SCHOOLS)[number]; hidden: boolean }> = ({ school, hidden }) => (
  <li
    aria-hidden={hidden || undefined}
    className="shrink-0 w-48 h-28 flex items-center justify-center rounded-xl bg-white dark:bg-gray-300 border border-gray-200 dark:border-gray-700 px-5"
    title={school.name}
  >
    <img
      src={school.logo}
      alt={hidden ? '' : school.name}
      loading="lazy"
      className="max-h-20 max-w-full object-contain"
    />
  </li>
);

const Schools: React.FC = () => (
  <section className="bg-white dark:bg-gray-950 py-12 border-b border-gray-100 dark:border-gray-900" aria-labelledby="schools-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 id="schools-title" className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-widest uppercase">
        Schools already running on Nuventa Cloud
      </h2>
    </div>

    <div className="group relative mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <ul className="flex w-max gap-6 animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {RUN.map((s, i) => <Tile key={`a${i}`} school={s} hidden={i >= SCHOOLS.length} />)}
        {RUN.map((s, i) => <Tile key={`b${i}`} school={s} hidden />)}
      </ul>
    </div>
  </section>
);

export default Schools;

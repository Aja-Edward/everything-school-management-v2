import React, { useEffect, useRef } from 'react';

interface RibbonBannerProps {
  text: string;
  speed?: 'slow' | 'medium' | 'fast';
  primaryColor?: string;
}

const speedMap = { slow: '40s', medium: '22s', fast: '12s' };

const RibbonBanner: React.FC<RibbonBannerProps> = ({
  text,
  speed = 'medium',
  primaryColor = '#1e40af',
}) => {
  const duration = speedMap[speed];
  const repeated = Array(8).fill(text).join('   ✦   ');

  return (
    <div
      className="w-full overflow-hidden py-2 z-50"
      style={{ backgroundColor: primaryColor }}
    >
      <style>{`
        @keyframes ribbon-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ribbon-track {
          display: flex;
          width: max-content;
          animation: ribbon-scroll ${duration} linear infinite;
          white-space: nowrap;
        }
      `}</style>
      <div className="ribbon-track">
        <span className="text-white text-sm font-semibold tracking-wide px-4">
          {repeated}&nbsp;&nbsp;&nbsp;✦&nbsp;&nbsp;&nbsp;{repeated}
        </span>
      </div>
    </div>
  );
};

export default RibbonBanner;

import React from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import InvigilationBoard from '@/components/cbt/invigilation/InvigilationBoard';
import StationService from '@/services/StationService';

/** The invigilation board on its own, for the station's staff account: no school dashboard around it. */
const StationBoardPage: React.FC = () => {
  const { paperId } = useParams();
  return (
    <div className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950 sm:p-6">
      <button type="button" onClick={() => void StationService.signOut('/station/staff')}
        className="mb-3 flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Station staff
      </button>
      <InvigilationBoard key={paperId} paperId={Number(paperId)} />
    </div>
  );
};

export default StationBoardPage;

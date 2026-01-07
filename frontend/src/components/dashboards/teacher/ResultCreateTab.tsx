// ResultCreateTab.tsx
import React from 'react';
import ResultRecordingForm from '@/components/dashboards/teacher/ResultRecordingForm';

interface ResultCreateTabProps {
  onResultCreated: () => void;
  onSuccess: () => void;
  onClose: () => void;
}

const ResultCreateTab: React.FC<ResultCreateTabProps> = ({
  onResultCreated,
//   onSuccess,
  onClose
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <ResultRecordingForm
        isOpen={true} 
        onClose={onClose} 
        onResultCreated={onResultCreated}
        // onSuccess={onSuccess}
        editResult={null} 
        mode="create" 
      />
    </div>
  );
};

export default ResultCreateTab;
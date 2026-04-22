// import React from 'react';
// import SeniorSecondarySessionReport from './SeniorSecondarySessionReport';
// import SeniorSecondaryTermlyResult from './SeniorSecondaryTermlyResult';
// import PrimaryResult from './PrimaryResult';
// import JuniorSecondaryResult from './JuniorSecondaryResult';
// import NurseryResult from './NurseryResult';

// interface SelectionData {
//   academicSession: string;
//   term: string;
//   class: string;
//   resultType?: string;
// }

// interface ResultDisplayProps {
//   selections: SelectionData;
//   studentName: string;
//   onBack: () => void;
// }

// const ResultDisplay: React.FC<ResultDisplayProps> = ({ selections, studentName, onBack }) => {
//   // Determine which template to use based on class
//   const getResultTemplate = () => {
//     const className = selections.class.toLowerCase();
    
//     // Nursery classes
//     if (className.includes('nursery')) {
//       return (
//         <NurseryResult 
//           studentData={{ 
//             name: studentName,
//             class: selections.class,
//             term: selections.term,
//             date: new Date().toLocaleDateString(),
//             house: 'Blue House',
//             timesOpened: '120',
//             timesPresent: '115'
//           }} 
//         />
//       );
//     }
    
//     // Primary classes
//     if (className.includes('primary')) {
//       return (
//         <PrimaryResult 
//           studentData={{ 
//             name: studentName,
//             class: selections.class,
//             term: selections.term,
//             academicSession: selections.academicSession
//           }} 
//         />
//       );
//     }
    
//          // Junior Secondary classes (JSS) - temporarily using Primary template
//      if (className.includes('jss')) {
//        return (
//          <JuniorSecondaryResult 
//            studentData={{ 
//              name: studentName,
//              class: selections.class,
//              term: selections.term,
//              academicSession: selections.academicSession,
//              resultType: selections.resultType
//            }} 
//          />
//        );
//      }
     
//            // Senior Secondary classes (SSS)
//       if (className.includes('sss')) {
//         // Use SessionResult for Annually, TermlyResult for Termly
//         if (selections.resultType === 'annually') {
//           return (
//             <SeniorSecondarySessionReport 
//               studentData={{ 
//                 name: studentName,
//                 class: selections.class,
//                 term: selections.term,
//                 academicSession: selections.academicSession,
//                 resultType: selections.resultType
//               }} 
//             />
//           );
//         } else {
//           return (
//             <SeniorSecondaryTermlyResult 
//               studentData={{ 
//                 name: studentName,
//                 class: selections.class,
//                 term: selections.term,
//                 academicSession: selections.academicSession,
//                 resultType: selections.resultType
//               }} 
//             />
//           );
//         }
//       }
    
//     // Default to PortalContent for any other classes
//     return (
//       <SeniorSecondarySessionReport 
//         studentData={{ 
//           name: studentName,
//           class: selections.class,
//           term: selections.term,
//           academicSession: selections.academicSession
//         }} 
//       />
//     );
//   };

//   return (
//     <div className="space-y-6">
//       {/* Header with back button */}
//       <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
//                <div>
//          <h2 className="text-2xl font-bold text-gray-800">Result Sheet</h2>
//          <p className="text-gray-600">
//            {selections.academicSession} • {selections.term} • {selections.class}
//            {selections.resultType && ` • ${selections.resultType.charAt(0).toUpperCase() + selections.resultType.slice(1)}`}
//          </p>
//        </div>
//         <button
//           onClick={onBack}
//           className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
//         >
//           ← Back to Selection
//         </button>
//       </div>

//       {/* Result Template */}
//       <div className="bg-white rounded-xl shadow-sm overflow-hidden">
//         {getResultTemplate()}
//       </div>
//     </div>
//   );
// };

// export default ResultDisplay;

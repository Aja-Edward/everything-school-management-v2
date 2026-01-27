// // // components/ExamFormModal.tsx
// // import React, { useState, useEffect } from "react";
// // import { ObjectiveQuestion, TheoryQuestion, PracticalQuestion, CustomSection } from "@/types/types";
// // import RichTextEditor from "./RichTextEditor";
// // import { ExamCreateData, Exam } from '@/services/ExamService';
// // import QuestionSectionObjectives from "./QuestionSectionObjectives";
// // import QuestionSectionTheory from "./QuestionSectionTheory";
// // import QuestionSectionPractical from "./QuestionSectionPractical";
// // import QuestionSectionCustom from "./QuestionSectionCustom"

// // interface ExamFormModalProps {
// //   open: boolean;
// //   exam?: Exam | null;
// //   onClose: () => void;
// //   onSubmit: (examData: ExamCreateData) => void;
// // }

// // const getInitialState = (exam?: Exam | null): ExamCreateData => ({
// //   title: exam?.title || "",
// //   description: exam?.description || "",
// //   subject: exam?.subject || 0,
// //   grade_level: exam?.grade_level || 0,
// //   exam_type: exam?.exam_type || "",
// //   difficulty_level: exam?.difficulty_level || "",
// //   exam_date: exam?.exam_date || "",
// //   start_time: exam?.start_time || "",
// //   end_time: exam?.end_time || "",
// //   duration_minutes: exam?.duration_minutes || 0,
// //   total_marks: exam?.total_marks || 0,
// //   pass_marks: exam?.pass_marks || 0,
// //   venue: exam?.venue || "",
// //   max_students: exam?.max_students || 0,
// //   instructions: exam?.instructions || "",
// //   materials_allowed: exam?.materials_allowed || "",
// //   materials_provided: exam?.materials_provided || "",
// //   status: exam?.status || "draft",
// //   is_practical: exam?.is_practical || false,
// //   requires_computer: exam?.requires_computer || false,
// //   is_online: exam?.is_online || false,
// //   objective_questions: exam?.objective_questions || [],
// //   theory_questions: exam?.theory_questions || [],
// //   practical_questions: exam?.practical_questions || [],
// //   custom_sections: exam?.custom_sections || [],
// //   objective_instructions: exam?.objective_instructions || "",
// //   theory_instructions: exam?.theory_instructions || "",
// //   practical_instructions: exam?.practical_instructions || "",
// // });

// // const ExamFormModal: React.FC<ExamFormModalProps> = ({ open, exam, onClose, onSubmit }) => {
// //   const [form, setForm] = useState<ExamCreateData>(getInitialState(exam));
// //   const [activeTab, setActiveTab] = useState<"general" | "objectives" | "theory" | "practical" | "custom">("general");

// //   useEffect(() => {
// //     if (open) {
// //       setForm(getInitialState(exam));
// //       setActiveTab("general"); // Reset to general tab when opening
// //     }
// //   }, [open, exam]);

// //   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
// //     const { name, value, type } = e.target;
    
// //     // Handle number inputs
// //     if (type === 'number') {
// //       setForm({ ...form, [name]: value === '' ? 0 : Number(value) });
// //     } else {
// //       setForm({ ...form, [name]: value });
// //     }
// //   };

// //   const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //     setForm({ ...form, [e.target.name]: e.target.checked });
// //   };

// //   const handleObjectivesChange = (questions: ObjectiveQuestion[]) =>
// //     setForm((prev) => ({ ...prev, objective_questions: questions }));

// //   const handleTheoryChange = (questions: TheoryQuestion[]) =>
// //     setForm((prev) => ({ ...prev, theory_questions: questions }));

// //   const handlePracticalChange = (questions: PracticalQuestion[]) =>
// //     setForm((prev) => ({ ...prev, practical_questions: questions }));

// //   const handleCustomChange = (sections: CustomSection[]) =>
// //     setForm((prev) => ({ ...prev, custom_sections: sections }));

// //   const handleSubmit = (e: React.FormEvent) => {
// //     e.preventDefault();
// //     onSubmit(form);
// //   };

// //   if (!open) return null;

// //   return (
// //     <div className="modal-overlay" style={{ 
// //       position: 'fixed', 
// //       top: 0, 
// //       left: 0, 
// //       right: 0, 
// //       bottom: 0, 
// //       backgroundColor: 'rgba(0,0,0,0.5)', 
// //       display: 'flex', 
// //       alignItems: 'center', 
// //       justifyContent: 'center',
// //       zIndex: 1000
// //     }}>
// //       <div className="modal-content" style={{ 
// //         backgroundColor: 'white', 
// //         borderRadius: 8, 
// //         maxHeight: "90vh", 
// //         overflowY: "auto", 
// //         width: "90vw", 
// //         maxWidth: 1200,
// //         padding: 24
// //       }}>
// //         <div className="modal-header" style={{ 
// //           display: 'flex', 
// //           justifyContent: 'space-between', 
// //           alignItems: 'center', 
// //           marginBottom: 24,
// //           borderBottom: '2px solid #e5e7eb',
// //           paddingBottom: 16
// //         }}>
// //           <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
// //             {exam ? "Edit" : "Create"} Exam
// //           </h2>
// //           <button 
// //             className="close-btn" 
// //             onClick={onClose}
// //             style={{ 
// //               fontSize: 32, 
// //               border: 'none', 
// //               background: 'none', 
// //               cursor: 'pointer',
// //               color: '#6b7280',
// //               padding: 0,
// //               lineHeight: 1
// //             }}
// //           >
// //             ×
// //           </button>
// //         </div>

// //         <div className="tab-navigation" style={{ 
// //           display: "flex", 
// //           gap: 8, 
// //           borderBottom: "2px solid #e5e7eb", 
// //           marginBottom: 24 
// //         }}>
// //           {[
// //             { key: "general", label: "General Info" },
// //             { key: "objectives", label: "Objectives" },
// //             { key: "theory", label: "Theory" },
// //             { key: "practical", label: "Practical" },
// //             { key: "custom", label: "Custom Sections" }
// //           ].map(tab => (
// //             <button
// //               key={tab.key}
// //               type="button"
// //               className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
// //               onClick={() => setActiveTab(tab.key as any)}
// //               style={{
// //                 padding: '12px 20px',
// //                 border: 'none',
// //                 background: activeTab === tab.key ? '#3b82f6' : 'transparent',
// //                 color: activeTab === tab.key ? 'white' : '#6b7280',
// //                 cursor: 'pointer',
// //                 borderRadius: '4px 4px 0 0',
// //                 fontWeight: activeTab === tab.key ? 'bold' : 'normal',
// //                 transition: 'all 0.2s'
// //               }}
// //             >
// //               {tab.label}
// //             </button>
// //           ))}
// //         </div>

// //         <form onSubmit={handleSubmit}>
// //           {activeTab === "general" && (
// //             <div className="tab-content">
// //               <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 'bold' }}>Exam Information</h3>

// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Title *</label>
// //                 <input
// //                   name="title"
// //                   value={form.title}
// //                   onChange={handleChange}
// //                   placeholder="Exam Title"
// //                   required
// //                   className="form-input"
// //                   style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                 />
// //               </div>

// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Description</label>
// //                 <RichTextEditor
// //                   value={form.description || ""}
// //                   onChange={(val) => setForm({ ...form, description: val })}
// //                   placeholder="Exam description..."
// //                 />
// //               </div>

// //               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Subject *</label>
// //                   <input
// //                     name="subject"
// //                     type="number"
// //                     value={form.subject}
// //                     onChange={handleChange}
// //                     placeholder="Subject ID"
// //                     required
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Grade Level *</label>
// //                   <input
// //                     name="grade_level"
// //                     type="number"
// //                     value={form.grade_level}
// //                     onChange={handleChange}
// //                     placeholder="Grade Level"
// //                     required
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>
// //               </div>

// //               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Type</label>
// //                   <input
// //                     name="exam_type"
// //                     value={form.exam_type || ""}
// //                     onChange={handleChange}
// //                     placeholder="e.g., Midterm, Final, Quiz"
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Difficulty Level</label>
// //                   <select
// //                     name="difficulty_level"
// //                     value={form.difficulty_level || ""}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   >
// //                     <option value="">Select...</option>
// //                     <option value="easy">Easy</option>
// //                     <option value="medium">Medium</option>
// //                     <option value="hard">Hard</option>
// //                   </select>
// //                 </div>
// //               </div>

// //               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Date</label>
// //                   <input
// //                     name="exam_date"
// //                     type="date"
// //                     value={form.exam_date || ""}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Start Time</label>
// //                   <input
// //                     name="start_time"
// //                     type="time"
// //                     value={form.start_time || ""}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>End Time</label>
// //                   <input
// //                     name="end_time"
// //                     type="time"
// //                     value={form.end_time || ""}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>
// //               </div>

// //               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Duration (minutes)</label>
// //                   <input
// //                     name="duration_minutes"
// //                     type="number"
// //                     value={form.duration_minutes || 0}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Total Marks *</label>
// //                   <input
// //                     name="total_marks"
// //                     type="number"
// //                     value={form.total_marks || 0}
// //                     onChange={handleChange}
// //                     required
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Pass Marks</label>
// //                   <input
// //                     name="pass_marks"
// //                     type="number"
// //                     value={form.pass_marks || 0}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>
// //               </div>

// //               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Venue</label>
// //                   <input
// //                     name="venue"
// //                     value={form.venue || ""}
// //                     onChange={handleChange}
// //                     placeholder="Exam venue"
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>

// //                 <div className="form-group">
// //                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Max Students</label>
// //                   <input
// //                     name="max_students"
// //                     type="number"
// //                     value={form.max_students || 0}
// //                     onChange={handleChange}
// //                     className="form-input"
// //                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
// //                   />
// //                 </div>
// //               </div>

// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Instructions</label>
// //                 <RichTextEditor
// //                   value={form.instructions || ""}
// //                   onChange={(val) => setForm({ ...form, instructions: val })}
// //                   placeholder="General exam instructions..."
// //                 />
// //               </div>

// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Allowed</label>
// //                 <RichTextEditor
// //                   value={form.materials_allowed || ""}
// //                   onChange={(val) => setForm({ ...form, materials_allowed: val })}
// //                   placeholder="Allowed materials..."
// //                 />
// //               </div>

// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Provided</label>
// //                 <RichTextEditor
// //                   value={form.materials_provided || ""}
// //                   onChange={(val) => setForm({ ...form, materials_provided: val })}
// //                   placeholder="Materials provided..."
// //                 />
// //               </div>

// //               <div className="form-group" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
// //                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
// //                   <input
// //                     name="is_practical"
// //                     type="checkbox"
// //                     checked={form.is_practical || false}
// //                     onChange={handleCheckboxChange}
// //                   />
// //                   Is Practical
// //                 </label>
// //                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
// //                   <input
// //                     name="requires_computer"
// //                     type="checkbox"
// //                     checked={form.requires_computer || false}
// //                     onChange={handleCheckboxChange}
// //                   />
// //                   Requires Computer
// //                 </label>
// //                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
// //                   <input
// //                     name="is_online"
// //                     type="checkbox"
// //                     checked={form.is_online || false}
// //                     onChange={handleCheckboxChange}
// //                   />
// //                   Is Online
// //                 </label>
// //               </div>
// //             </div>
// //           )}

// //           {activeTab === "objectives" && (
// //             <div className="tab-content">
// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Objective Instructions</label>
// //                 <RichTextEditor
// //                   value={form.objective_instructions || ""}
// //                   onChange={(val) => setForm({ ...form, objective_instructions: val })}
// //                   placeholder="Instructions for objective section..."
// //                 />
// //               </div>
// //               <QuestionSectionObjectives
// //                 value={form.objective_questions ?? []}
// //                 onChange={handleObjectivesChange}
// //               />
// //             </div>
// //           )}

// //           {activeTab === "theory" && (
// //             <div className="tab-content">
// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Theory Instructions</label>
// //                 <RichTextEditor
// //                   value={form.theory_instructions || ""}
// //                   onChange={(val) => setForm({ ...form, theory_instructions: val })}
// //                   placeholder="Instructions for theory section..."
// //                 />
// //               </div>
// //               <QuestionSectionTheory
// //                 value={form.theory_questions ?? []}
// //                 onChange={handleTheoryChange}
// //               />
// //             </div>
// //           )}

// //           {activeTab === "practical" && (
// //             <div className="tab-content">
// //               <div className="form-group" style={{ marginBottom: 16 }}>
// //                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Practical Instructions</label>
// //                 <RichTextEditor
// //                   value={form.practical_instructions || ""}
// //                   onChange={(val) => setForm({ ...form, practical_instructions: val })}
// //                   placeholder="Instructions for practical section..."
// //                 />
// //               </div>
// //               <QuestionSectionPractical
// //                 value={form.practical_questions ?? []}
// //                 onChange={handlePracticalChange}
// //               />
// //             </div>
// //           )}

// //           {activeTab === "custom" && (
// //             <div className="tab-content">
// //               <QuestionSectionCustom
// //                 value={form.custom_sections ?? []}
// //                 onChange={handleCustomChange}
// //               />
// //             </div>
// //           )}

// //           <div className="modal-footer" style={{ 
// //             display: "flex", 
// //             gap: 12, 
// //             justifyContent: "flex-end", 
// //             marginTop: 24, 
// //             borderTop: "2px solid #e5e7eb", 
// //             paddingTop: 16 
// //           }}>
// //             <button 
// //               type="button" 
// //               onClick={onClose} 
// //               className="btn btn-secondary"
// //               style={{
// //                 padding: '10px 20px',
// //                 border: '1px solid #d1d5db',
// //                 background: 'white',
// //                 borderRadius: 4,
// //                 cursor: 'pointer',
// //                 fontWeight: 500
// //               }}
// //             >
// //               Cancel
// //             </button>
// //             <button 
// //               type="submit" 
// //               className="btn btn-primary"
// //               style={{
// //                 padding: '10px 20px',
// //                 border: 'none',
// //                 background: '#3b82f6',
// //                 color: 'white',
// //                 borderRadius: 4,
// //                 cursor: 'pointer',
// //                 fontWeight: 500
// //               }}
// //             >
// //               {exam ? "Save Changes" : "Create Exam"}
// //             </button>
// //           </div>
// //         </form>
// //       </div>
// //     </div>
// //   );
// // };

// // export default ExamFormModal;

// // components/ExamFormModal.tsx
// // components/ExamFormModal.tsx - Key improvements for prepopulation
// import React, { useState, useEffect } from "react";
// import { ObjectiveQuestion, TheoryQuestion, PracticalQuestion, CustomSection } from "@/types/types";
// import RichTextEditor from "./RichTextEditor";
// import { ExamCreateData, Exam } from '@/services/ExamService';
// import QuestionSectionObjectives from "./QuestionSectionObjectives";
// import QuestionSectionTheory from "./QuestionSectionTheory";
// import QuestionSectionPractical from "./QuestionSectionPractical";
// import QuestionSectionCustom from "./QuestionSectionCustom";
// import api from '@/services/api';

// interface ExamFormModalProps {
//   open: boolean;
//   exam?: Exam | null;
//   onClose: () => void;
//   onSubmit: (examData: ExamCreateData) => void;
// }

// // Helper function to safely extract array from API response
// const safeArrayFromResponse = (data: any): any[] => {
//   if (Array.isArray(data)) return data;
//   if (data && Array.isArray(data.results)) return data.results;
//   if (data && typeof data === 'object') {
//     const arrayProps = ['data', 'items', 'list'];
//     for (const prop of arrayProps) {
//       if (Array.isArray(data[prop])) return data[prop];
//     }
//   }
//   return [];
// };


// const getInitialState = (exam?: Exam | null, subjects?: any[], gradeLevels?: any[]): ExamCreateData => {
//   let subjectId = 0;
//   let gradeLevelId = 0;

//   // Try to extract IDs from the exam object
//   if (exam) {
//     // First try direct ID access
//     subjectId = exam?.subject?.id || exam?.subject || 0;
//     gradeLevelId = exam?.grade_level?.id || exam?.grade_level || 0;

//     // If IDs are still 0 or null, try to look them up by name
//     if ((!subjectId || subjectId === 0) && exam.subject_name && subjects && subjects.length > 0) {
//       const foundSubject = subjects.find(s => s.name === exam.subject_name || s.code === exam.subject_code);
//       if (foundSubject) {
//         subjectId = foundSubject.id;
//         console.log('✅ Found subject ID by name:', subjectId, foundSubject.name);
//       } else {
//         console.log('⚠️ Could not find subject:', exam.subject_name);
//       }
//     }

//     if ((!gradeLevelId || gradeLevelId === 0) && exam.grade_level_name && gradeLevels && gradeLevels.length > 0) {
//       const foundGrade = gradeLevels.find(g => g.name === exam.grade_level_name);
//       if (foundGrade) {
//         gradeLevelId = foundGrade.id;
//         console.log('✅ Found grade level ID by name:', gradeLevelId, foundGrade.name);
//       } else {
//         console.log('⚠️ Could not find grade level:', exam.grade_level_name);
//       }
//     }
//   }
  
//    const difficultyLevel = exam?.difficulty_level 
//     ? String(exam.difficulty_level).toLowerCase().trim()
//     : "";
  
//   console.log('📊 Difficulty level:', difficultyLevel || '(empty)');
  
//   // Handle max_students - preserve the value even if 0
//   const maxStudents = exam?.max_students !== undefined && exam?.max_students !== null
//     ? Number(exam.max_students)
//     : 0;
  
//   console.log('👥 Max students:', maxStudents);
  
//   console.log('🔄 Initializing form with exam:', exam);
//   console.log('📊 Extracted IDs:', { subjectId, gradeLevelId });
//   console.log('📋 Other fields:', { difficultyLevel, maxStudents });
  
//   return {
//     title: exam?.title || "",
//     description: exam?.description || "",
//     subject: subjectId,
//     grade_level: gradeLevelId,
//     exam_type: exam?.exam_type || "",
//     difficulty_level: difficultyLevel,
//     exam_date: exam?.exam_date || "",
//     start_time: exam?.start_time || "",
//     end_time: exam?.end_time || "",
//     duration_minutes: exam?.duration_minutes || 0,
//     total_marks: exam?.total_marks || 0,
//     pass_marks: exam?.pass_marks || 0,
//     venue: exam?.venue || "",
//     max_students: maxStudents,
//     instructions: exam?.instructions || "",
//     materials_allowed: exam?.materials_allowed || "",
//     materials_provided: exam?.materials_provided || "",
//     status: exam?.status || "draft",
//     is_practical: exam?.is_practical || false,
//     requires_computer: exam?.requires_computer || false,
//     is_online: exam?.is_online || false,
//     objective_questions: exam?.objective_questions || [],
//     theory_questions: exam?.theory_questions || [],
//     practical_questions: exam?.practical_questions || [],
//     custom_sections: exam?.custom_sections || [],
//     objective_instructions: exam?.objective_instructions || "",
//     theory_instructions: exam?.theory_instructions || "",
//     practical_instructions: exam?.practical_instructions || "",
//   };
// };
// // const getInitialState = (exam?: Exam | null, subjects?: any[], gradeLevels?: any[]): ExamCreateData => {
// //   let subjectId = 0;
// //   let gradeLevelId = 0;

// //   // Try to extract IDs from the exam object
// //   if (exam) {
// //     // First try direct ID access
// //     subjectId = exam?.subject?.id || exam?.subject || 0;
// //     gradeLevelId = exam?.grade_level?.id || exam?.grade_level || 0;

// //     // If IDs are still 0 or null, try to look them up by name
// //     if ((!subjectId || subjectId === 0) && exam.subject_name && subjects && subjects.length > 0) {
// //       const foundSubject = subjects.find(s => s.name === exam.subject_name || s.code === exam.subject_code);
// //       if (foundSubject) {
// //         subjectId = foundSubject.id;
// //         console.log('✅ Found subject ID by name:', subjectId, foundSubject.name);
// //       } else {
// //         console.log('⚠️ Could not find subject:', exam.subject_name);
// //       }
// //     }

// //     if ((!gradeLevelId || gradeLevelId === 0) && exam.grade_level_name && gradeLevels && gradeLevels.length > 0) {
// //       const foundGrade = gradeLevels.find(g => g.name === exam.grade_level_name);
// //       if (foundGrade) {
// //         gradeLevelId = foundGrade.id;
// //         console.log('✅ Found grade level ID by name:', gradeLevelId, foundGrade.name);
// //       } else {
// //         console.log('⚠️ Could not find grade level:', exam.grade_level_name);
// //       }
// //     }
// //   }
// //   // Normalize difficulty level to match dropdown options
// //   const difficultyLevel = exam?.difficulty_level 
// //     ? String(exam.difficulty_level).toLowerCase() 
// //     : "";
  
// //   // Handle max_students - ensure it's a number or 0
// //   const maxStudents = exam?.max_students != null 
// //     ? Number(exam.max_students) 
// //     : 0;
  
// //   console.log('🔄 Initializing form with exam:', exam);
// //   console.log('📊 Extracted IDs:', { subjectId, gradeLevelId });
// //   console.log('📋 Other fields:', { difficultyLevel, maxStudents });
    
// //   return {
// //     title: exam?.title ?? "",
// //     description: exam?.description ?? "",
// //     subject: subjectId,
// //     grade_level: gradeLevelId,
// //     exam_type: exam?.exam_type ?? "",
// //     difficulty_level: exam?.difficulty_level ?? "",
// //     exam_date: exam?.exam_date ?? "",
// //     start_time: exam?.start_time ?? "",
// //     end_time: exam?.end_time ?? "",
// //     duration_minutes: exam?.duration_minutes ?? 0,
// //     total_marks: exam?.total_marks ?? 0,
// //     pass_marks: exam?.pass_marks ?? 0,
// //     venue: exam?.venue ?? "",
// //     max_students: exam?.max_students ?? 0,
// //     instructions: exam?.instructions ?? "",
// //     materials_allowed: exam?.materials_allowed ?? "",
// //     materials_provided: exam?.materials_provided ?? "",
// //     status: exam?.status ?? "draft",
// //     is_practical: exam?.is_practical ?? false,
// //     requires_computer: exam?.requires_computer ?? false,
// //     is_online: exam?.is_online ?? false,
// //     objective_questions: exam?.objective_questions ?? [],
// //     theory_questions: exam?.theory_questions ?? [],
// //     practical_questions: exam?.practical_questions ?? [],
// //     custom_sections: exam?.custom_sections ?? [],
// //     objective_instructions: exam?.objective_instructions ?? "",
// //     theory_instructions: exam?.theory_instructions ?? "",
// //     practical_instructions: exam?.practical_instructions ?? "",
// //   };
// // };

// const ExamFormModal: React.FC<ExamFormModalProps> = ({ open, exam, onClose, onSubmit }) => {
//   // Backend data states - declare FIRST
//   const [gradeLevels, setGradeLevels] = useState<any[]>([]);
//   const [subjects, setSubjects] = useState<any[]>([]);
//   const [filteredSubjects, setFilteredSubjects] = useState<any[]>([]);
//   const [backendDataLoading, setBackendDataLoading] = useState(true);
  
//   // Form state - initialize with empty defaults
//   const [form, setForm] = useState<ExamCreateData>(() => getInitialState(null, [], []));
//   const [activeTab, setActiveTab] = useState<"general" | "objectives" | "theory" | "practical" | "custom">("general");

//   // Load backend data
//   useEffect(() => {
//     const loadBackendData = async () => {
//       if (!open) return;
      
//       try {
//         setBackendDataLoading(true);

//         let gradeLevels: any[] = [];
//         let subjects: any[] = [];

//         try {
//           const gradeLevelsData = await api.get('/api/classrooms/grades/');
//           gradeLevels = safeArrayFromResponse(gradeLevelsData);
//           console.log('📚 Loaded grade levels:', gradeLevels);
//         } catch (err) {
//           console.error('Failed to load grade levels:', err);
//         }

//         try {
//           const subjectsData = await api.get('/api/subjects/');
//           subjects = safeArrayFromResponse(subjectsData);
//           console.log('📖 Loaded subjects:', subjects);
//         } catch (err) {
//           console.error('Failed to load subjects:', err);
//         }

//         setGradeLevels(gradeLevels);
//         setSubjects(subjects);
//         setFilteredSubjects(subjects);
//       } catch (err) {
//         console.error('Error loading backend data:', err);
//       } finally {
//         setBackendDataLoading(false);
//       }
//     };

//     loadBackendData();
//   }, [open]);

//   // Initialize form when backend data is loaded
//   useEffect(() => {
//     if (open && !backendDataLoading && subjects.length > 0 && gradeLevels.length > 0) {
//       console.log('📝 Resetting form with exam:', exam);
//       console.log('📚 Available subjects:', subjects.length);
//       console.log('📊 Available grade levels:', gradeLevels.length);
      
//       const initialState = getInitialState(exam, subjects, gradeLevels);
//       console.log('✅ Initial state:', initialState);
//       setForm(initialState);
//       setActiveTab("general");
      
//       // Filter subjects for the loaded exam
//       if (exam && initialState.grade_level) {
//         const selectedGradeLevel = gradeLevels.find(gl => gl?.id === initialState.grade_level);
//         if (selectedGradeLevel) {
//           const filtered = subjects.filter(subject => {
//             const subjectEducationLevels = subject?.education_levels || [];
//             const gradeEducationLevel = selectedGradeLevel?.education_level;
//             return subjectEducationLevels.includes(gradeEducationLevel);
//           });
//           console.log('🔍 Filtered subjects for editing:', filtered.length);
//           setFilteredSubjects(filtered);
//         }
//       }
//     }
//   }, [open, exam, backendDataLoading, subjects, gradeLevels]);

//   // Filter subjects based on selected grade level (for user changes)
//   useEffect(() => {
//     if (form.grade_level && subjects.length > 0 && gradeLevels.length > 0) {
//       const selectedGradeLevel = gradeLevels.find(gl => gl?.id === form.grade_level);
//       if (selectedGradeLevel) {
//         const filtered = subjects.filter(subject => {
//           const subjectEducationLevels = subject?.education_levels || [];
//           const gradeEducationLevel = selectedGradeLevel?.education_level;
//           return subjectEducationLevels.includes(gradeEducationLevel);
//         });
//         console.log('🔄 Updated filtered subjects:', filtered.length);
//         setFilteredSubjects(filtered);
//       } else {
//         setFilteredSubjects(subjects);
//       }
//     }
//   }, [form.grade_level, subjects, gradeLevels]);

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
//     const { name, value, type } = e.target;
    
//     if (type === 'number') {
//       setForm({ ...form, [name]: value === '' ? 0 : Number(value) });
//     } else {
//       setForm({ ...form, [name]: value });
//     }
//   };

//   const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setForm({ ...form, [e.target.name]: e.target.checked });
//   };

//   const handleGradeLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
//     const gradeLevelId = parseInt(e.target.value) || 0;
    
//     // When editing, preserve subject if it's valid for new grade level
//     // When creating new, reset subject
//     if (exam) {
//       setForm(prev => ({
//         ...prev,
//         grade_level: gradeLevelId,
//         // Keep subject if editing, will be filtered by useEffect
//       }));
//     } else {
//       setForm(prev => ({
//         ...prev,
//         grade_level: gradeLevelId,
//         subject: 0, // Reset subject when grade changes for new exam
//       }));
//     }
//   };

//   const handleObjectivesChange = (questions: ObjectiveQuestion[]) =>
//     setForm((prev) => ({ ...prev, objective_questions: questions }));

//   const handleTheoryChange = (questions: TheoryQuestion[]) =>
//     setForm((prev) => ({ ...prev, theory_questions: questions }));

//   const handlePracticalChange = (questions: PracticalQuestion[]) =>
//     setForm((prev) => ({ ...prev, practical_questions: questions }));

//   const handleCustomChange = (sections: CustomSection[]) =>
//     setForm((prev) => ({ ...prev, custom_sections: sections }));

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
    
//     // Validate required fields
//     if (!form.subject || form.subject === 0) {
//       alert('Please select a subject');
//       return;
//     }
    
//     if (!form.grade_level || form.grade_level === 0) {
//       alert('Please select a grade level');
//       return;
//     }
    
//     console.log('📤 Submitting form:', form);
//     onSubmit(form);
//   };

//   if (!open) return null;

//   // Show loading state while fetching backend data
//   if (backendDataLoading) {
//     return (
//       <div className="modal-overlay" style={{ 
//         position: 'fixed', 
//         top: 0, 
//         left: 0, 
//         right: 0, 
//         bottom: 0, 
//         backgroundColor: 'rgba(0,0,0,0.5)', 
//         display: 'flex', 
//         alignItems: 'center', 
//         justifyContent: 'center',
//         zIndex: 1000
//       }}>
//         <div className="bg-white rounded-lg p-8 text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
//           <p className="text-gray-600">Loading form data...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="modal-overlay" style={{ 
//       position: 'fixed', 
//       top: 0, 
//       left: 0, 
//       right: 0, 
//       bottom: 0, 
//       backgroundColor: 'rgba(0,0,0,0.5)', 
//       display: 'flex', 
//       alignItems: 'center', 
//       justifyContent: 'center',
//       zIndex: 1000
//     }}>
//       <div className="modal-content" style={{ 
//         backgroundColor: 'white', 
//         borderRadius: 8, 
//         maxHeight: "90vh", 
//         overflowY: "auto", 
//         width: "90vw", 
//         maxWidth: 1200,
//         padding: 24
//       }}>
//         <div className="modal-header" style={{ 
//           display: 'flex', 
//           justifyContent: 'space-between', 
//           alignItems: 'center', 
//           marginBottom: 24,
//           borderBottom: '2px solid #e5e7eb',
//           paddingBottom: 16
//         }}>
//           <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
//             {exam ? "Edit" : "Create"} Exam
//             {exam && <span style={{ fontSize: 14, color: '#6b7280', marginLeft: 8 }}>ID: {exam.id}</span>}
//           </h2>
//           <button 
//             className="close-btn" 
//             onClick={onClose}
//             style={{ 
//               fontSize: 32, 
//               border: 'none', 
//               background: 'none', 
//               cursor: 'pointer',
//               color: '#6b7280',
//               padding: 0,
//               lineHeight: 1
//             }}
//           >
//             ×
//           </button>
//         </div>

//         <div className="tab-navigation" style={{ 
//           display: "flex", 
//           gap: 8, 
//           borderBottom: "2px solid #e5e7eb", 
//           marginBottom: 24,
//           flexWrap: 'wrap'
//         }}>
//           {[
//             { key: "general", label: "General Info" },
//             { key: "objectives", label: `Objectives (${form.objective_questions?.length || 0})` },
//             { key: "theory", label: `Theory (${form.theory_questions?.length || 0})` },
//             { key: "practical", label: `Practical (${form.practical_questions?.length || 0})` },
//             { key: "custom", label: `Custom (${form.custom_sections?.length || 0})` }
//           ].map(tab => (
//             <button
//               key={tab.key}
//               type="button"
//               className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
//               onClick={() => setActiveTab(tab.key as any)}
//               style={{
//                 padding: '12px 20px',
//                 border: 'none',
//                 background: activeTab === tab.key ? '#3b82f6' : 'transparent',
//                 color: activeTab === tab.key ? 'white' : '#6b7280',
//                 cursor: 'pointer',
//                 borderRadius: '4px 4px 0 0',
//                 fontWeight: activeTab === tab.key ? 'bold' : 'normal',
//                 transition: 'all 0.2s'
//               }}
//             >
//               {tab.label}
//             </button>
//           ))}
//         </div>

//         <form onSubmit={handleSubmit}>
//           {activeTab === "general" && (
//             <div className="tab-content">
//               <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 'bold' }}>Exam Information</h3>

//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Title *</label>
//                 <input
//                   name="title"
//                   value={form.title}
//                   onChange={handleChange}
//                   placeholder="Exam Title"
//                   required
//                   className="form-input"
//                   style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                 />
//               </div>

//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Description</label>
//                 <RichTextEditor
//                   value={form.description || ""}
//                   onChange={(val) => setForm({ ...form, description: val })}
//                   placeholder="Exam description..."
//                 />
//               </div>

//               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
//                     Grade Level * 
//                     {exam && form.grade_level > 0 && <span style={{ fontSize: 12, color: '#10b981', marginLeft: 8 }}>
//                       ✓ Loaded: ID {form.grade_level}
//                     </span>}
//                   </label>
//                   <select
//                     name="grade_level"
//                     value={form.grade_level}
//                     onChange={handleGradeLevelChange}
//                     required
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   >
//                     <option value={0}>Select Grade Level</option>
//                     {Array.isArray(gradeLevels) && gradeLevels.map(gradeLevel => (
//                       <option key={gradeLevel.id} value={gradeLevel.id}>
//                         {gradeLevel.name}
//                       </option>
//                     ))}
//                   </select>
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
//                     Subject *
//                     {exam && form.subject > 0 && <span style={{ fontSize: 12, color: '#10b981', marginLeft: 8 }}>
//                       ✓ Loaded: ID {form.subject}
//                     </span>}
//                   </label>
//                   <select
//                     name="subject"
//                     value={form.subject}
//                     onChange={handleChange}
//                     required
//                     disabled={!form.grade_level}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   >
//                     <option value={0}>Select Subject</option>
//                     {Array.isArray(filteredSubjects) && filteredSubjects.map(subject => (
//                       <option key={subject.id} value={subject.id}>
//                         {subject.name}
//                       </option>
//                     ))}
//                   </select>
//                   {!form.grade_level && (
//                     <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Please select a grade level first</p>
//                   )}
//                   {form.grade_level && filteredSubjects.length === 0 && (
//                     <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>No subjects available for this grade level</p>
//                   )}
//                 </div>
//               </div>

//               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Type</label>
//                   <input
//                     name="exam_type"
//                     value={form.exam_type || ""}
//                     onChange={handleChange}
//                     placeholder="e.g., Midterm, Final, Quiz"
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Difficulty Level</label>
//                   <select
//                     name="difficulty_level"
//                     value={form.difficulty_level || ""}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   >
//                     <option value="">Select...</option>
//                     <option value="easy">Easy</option>
//                     <option value="medium">Medium</option>
//                     <option value="hard">Hard</option>
//                   </select>
//                 </div>
//               </div>

//               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Date</label>
//                   <input
//                     name="exam_date"
//                     type="date"
//                     value={form.exam_date || ""}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Start Time</label>
//                   <input
//                     name="start_time"
//                     type="time"
//                     value={form.start_time || ""}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>End Time</label>
//                   <input
//                     name="end_time"
//                     type="time"
//                     value={form.end_time || ""}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>
//               </div>

//               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Duration (minutes)</label>
//                   <input
//                     name="duration_minutes"
//                     type="number"
//                     value={form.duration_minutes || 0}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Total Marks *</label>
//                   <input
//                     name="total_marks"
//                     type="number"
//                     value={form.total_marks || 0}
//                     onChange={handleChange}
//                     required
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Pass Marks</label>
//                   <input
//                     name="pass_marks"
//                     type="number"
//                     value={form.pass_marks || 0}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>
//               </div>

//               <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Venue</label>
//                   <input
//                     name="venue"
//                     value={form.venue || ""}
//                     onChange={handleChange}
//                     placeholder="Exam venue"
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>

//                 <div className="form-group">
//                   <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Max Students</label>
//                   <input
//                     name="max_students"
//                     type="number"
//                     value={form.max_students || 0}
//                     onChange={handleChange}
//                     className="form-input"
//                     style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
//                   />
//                 </div>
//               </div>

//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Instructions</label>
//                 <RichTextEditor
//                   value={form.instructions || ""}
//                   onChange={(val) => setForm({ ...form, instructions: val })}
//                   placeholder="General exam instructions..."
//                 />
//               </div>

//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Allowed</label>
//                 <RichTextEditor
//                   value={form.materials_allowed || ""}
//                   onChange={(val) => setForm({ ...form, materials_allowed: val })}
//                   placeholder="Allowed materials..."
//                 />
//               </div>

//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Provided</label>
//                 <RichTextEditor
//                   value={form.materials_provided || ""}
//                   onChange={(val) => setForm({ ...form, materials_provided: val })}
//                   placeholder="Materials provided..."
//                 />
//               </div>

//               <div className="form-group" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
//                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
//                   <input
//                     name="is_practical"
//                     type="checkbox"
//                     checked={form.is_practical || false}
//                     onChange={handleCheckboxChange}
//                   />
//                   Is Practical
//                 </label>
//                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
//                   <input
//                     name="requires_computer"
//                     type="checkbox"
//                     checked={form.requires_computer || false}
//                     onChange={handleCheckboxChange}
//                   />
//                   Requires Computer
//                 </label>
//                 <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
//                   <input
//                     name="is_online"
//                     type="checkbox"
//                     checked={form.is_online || false}
//                     onChange={handleCheckboxChange}
//                   />
//                   Is Online
//                 </label>
//               </div>
//             </div>
//           )}

//           {activeTab === "objectives" && (
//             <div className="tab-content">
//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Objective Instructions</label>
//                 <RichTextEditor
//                   value={form.objective_instructions || ""}
//                   onChange={(val) => setForm({ ...form, objective_instructions: val })}
//                   placeholder="Instructions for objective section..."
//                 />
//               </div>
//               <QuestionSectionObjectives
//                 value={form.objective_questions ?? []}
//                 onChange={handleObjectivesChange}
//               />
//             </div>
//           )}

//           {activeTab === "theory" && (
//             <div className="tab-content">
//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Theory Instructions</label>
//                 <RichTextEditor
//                   value={form.theory_instructions || ""}
//                   onChange={(val) => setForm({ ...form, theory_instructions: val })}
//                   placeholder="Instructions for theory section..."
//                 />
//               </div>
//               <QuestionSectionTheory
//                 value={form.theory_questions ?? []}
//                 onChange={handleTheoryChange}
//               />
//             </div>
//           )}

//           {activeTab === "practical" && (
//             <div className="tab-content">
//               <div className="form-group" style={{ marginBottom: 16 }}>
//                 <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Practical Instructions</label>
//                 <RichTextEditor
//                   value={form.practical_instructions || ""}
//                   onChange={(val) => setForm({ ...form, practical_instructions: val })}
//                   placeholder="Instructions for practical section..."
//                 />
//               </div>
//               <QuestionSectionPractical
//                 value={form.practical_questions ?? []}
//                 onChange={handlePracticalChange}
//               />
//             </div>
//           )}

//           {activeTab === "custom" && (
//             <div className="tab-content">
//               <QuestionSectionCustom
//                 value={form.custom_sections ?? []}
//                 onChange={handleCustomChange}
//               />
//             </div>
//           )}

//           <div className="modal-footer" style={{ 
//             display: "flex",
//             gap: 12, 
//             justifyContent: "flex-end", 
//             marginTop: 24, 
//             borderTop: "2px solid #e5e7eb", 
//             paddingTop: 16 
//           }}>
//             <button 
//               type="button" 
//               onClick={onClose} 
//               className="btn btn-secondary"
//               style={{
//                 padding: '10px 20px',
//                 border: '1px solid #d1d5db',
//                 background: 'white',
//                 borderRadius: 4,
//                 cursor: 'pointer',
//                 fontWeight: 500
//               }}
//             >
//               Cancel
//             </button>
//             <button 
//               type="submit" 
//               className="btn btn-primary"
//               style={{
//                 padding: '10px 20px',
//                 border: 'none',
//                 background: '#3b82f6',
//                 color: 'white',
//                 borderRadius: 4,
//                 cursor: 'pointer',
//                 fontWeight: 500
//               }}
//             >
//               {exam ? "Save Changes" : "Create Exam"}
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// };

// export default ExamFormModal;

import React, { useState, useEffect } from "react";
import { ObjectiveQuestion, TheoryQuestion, PracticalQuestion, CustomSection } from "@/types/types";
import { RichTextEditor } from "@/components/shared/ExamEditor";
import { ExamCreateData, Exam } from '@/services/ExamService';
import QuestionSectionObjectives from "./QuestionSectionObjectives";
import QuestionSectionTheory from "./QuestionSectionTheory";
import QuestionSectionPractical from "./QuestionSectionPractical";
import QuestionSectionCustom from "./QuestionSectionCustom";
import api from '@/services/api';

interface ExamFormModalProps {
  open: boolean;
  exam?: Exam | null;
  onClose: () => void;
  onSubmit: (examData: ExamCreateData) => void;
}

const safeArrayFromResponse = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  if (data && typeof data === 'object') {
    const arrayProps = ['data', 'items', 'list'];
    for (const prop of arrayProps) {
      if (Array.isArray(data[prop])) return data[prop];
    }
  }
  return [];
};

const getInitialState = (exam?: Exam | null, subjects?: any[], gradeLevels?: any[]): ExamCreateData => {
  let subjectId = 0;
  let gradeLevelId = 0;

  if (exam) {
    subjectId = exam?.subject?.id || exam?.subject || 0;
    gradeLevelId = exam?.grade_level?.id || exam?.grade_level || 0;

    if ((!subjectId || subjectId === 0) && exam.subject_name && subjects && subjects.length > 0) {
      const foundSubject = subjects.find(s => s.name === exam.subject_name || s.code === exam.subject_code);
      if (foundSubject) {
        subjectId = foundSubject.id;
        console.log('✅ Found subject ID by name:', subjectId, foundSubject.name);
      }
    }

    if ((!gradeLevelId || gradeLevelId === 0) && exam.grade_level_name && gradeLevels && gradeLevels.length > 0) {
      const foundGrade = gradeLevels.find(g => g.name === exam.grade_level_name);
      if (foundGrade) {
        gradeLevelId = foundGrade.id;
        console.log('✅ Found grade level ID by name:', gradeLevelId, foundGrade.name);
      }
    }
  }
  
  // Handle difficulty_level - keep as empty string if not set (will be removed before submission)
  const difficultyLevel = exam?.difficulty_level 
    ? String(exam.difficulty_level).toLowerCase().trim()
    : "";
  
  // Handle max_students - keep as 0 if not set (will be removed before submission)
  const maxStudents = exam?.max_students !== undefined && exam?.max_students !== null
    ? Number(exam.max_students)
    : 0;
  
  console.log('📊 Difficulty level:', difficultyLevel || '(empty)');
  console.log('👥 Max students:', maxStudents);
  
  return {
    title: exam?.title || "",
    description: exam?.description || "",
    subject: subjectId,
    grade_level: gradeLevelId,
    exam_type: exam?.exam_type || "",
    difficulty_level: difficultyLevel,
    exam_date: exam?.exam_date || "",
    start_time: exam?.start_time || "",
    end_time: exam?.end_time || "",
    duration_minutes: exam?.duration_minutes || 0,
    total_marks: exam?.total_marks || 0,
    pass_marks: exam?.pass_marks || 0,
    venue: exam?.venue || "",
    max_students: maxStudents,
    instructions: exam?.instructions || "",
    materials_allowed: exam?.materials_allowed || "",
    materials_provided: exam?.materials_provided || "",
    status: exam?.status || "draft",
    is_practical: exam?.is_practical || false,
    requires_computer: exam?.requires_computer || false,
    is_online: exam?.is_online || false,
    objective_questions: exam?.objective_questions || [],
    theory_questions: exam?.theory_questions || [],
    practical_questions: exam?.practical_questions || [],
    custom_sections: exam?.custom_sections || [],
    objective_instructions: exam?.objective_instructions || "",
    theory_instructions: exam?.theory_instructions || "",
    practical_instructions: exam?.practical_instructions || "",
  };
};

const ExamFormModal: React.FC<ExamFormModalProps> = ({ open, exam, onClose, onSubmit }) => {
  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<any[]>([]);
  const [backendDataLoading, setBackendDataLoading] = useState(true);
  const [form, setForm] = useState<ExamCreateData>(() => getInitialState(null, [], []));
  const [activeTab, setActiveTab] = useState<"general" | "objectives" | "theory" | "practical" | "custom">("general");

  useEffect(() => {
    const loadBackendData = async () => {
      if (!open) return;
      
      try {
        setBackendDataLoading(true);

        let gradeLevels: any[] = [];
        let subjects: any[] = [];

        try {
          const gradeLevelsData = await api.get('/api/classrooms/grades/');
          gradeLevels = safeArrayFromResponse(gradeLevelsData);
          console.log('📚 Loaded grade levels:', gradeLevels);
        } catch (err) {
          console.error('Failed to load grade levels:', err);
        }

        try {
          const subjectsData = await api.get('/api/subjects/');
          subjects = safeArrayFromResponse(subjectsData);
          console.log('📖 Loaded subjects:', subjects);
        } catch (err) {
          console.error('Failed to load subjects:', err);
        }

        setGradeLevels(gradeLevels);
        setSubjects(subjects);
        setFilteredSubjects(subjects);
      } catch (err) {
        console.error('Error loading backend data:', err);
      } finally {
        setBackendDataLoading(false);
      }
    };

    loadBackendData();
  }, [open]);

  useEffect(() => {
    if (open && !backendDataLoading && subjects.length > 0 && gradeLevels.length > 0) {
      console.log('📝 Resetting form with exam:', exam);
      
      const initialState = getInitialState(exam, subjects, gradeLevels);
      console.log('✅ Initial state:', initialState);
      setForm(initialState);
      setActiveTab("general");
      
      if (exam && initialState.grade_level) {
        const selectedGradeLevel = gradeLevels.find(gl => gl?.id === initialState.grade_level);
        if (selectedGradeLevel) {
          const filtered = subjects.filter(subject => {
            const subjectEducationLevels = subject?.education_levels || [];
            const gradeEducationLevel = selectedGradeLevel?.education_level;
            return subjectEducationLevels.includes(gradeEducationLevel);
          });
          console.log('🔍 Filtered subjects for editing:', filtered.length);
          setFilteredSubjects(filtered);
        }
      }
    }
  }, [open, exam, backendDataLoading, subjects, gradeLevels]);

  useEffect(() => {
    if (form.grade_level && subjects.length > 0 && gradeLevels.length > 0) {
      const selectedGradeLevel = gradeLevels.find(gl => gl?.id === form.grade_level);
      if (selectedGradeLevel) {
        const filtered = subjects.filter(subject => {
          const subjectEducationLevels = subject?.education_levels || [];
          const gradeEducationLevel = selectedGradeLevel?.education_level;
          return subjectEducationLevels.includes(gradeEducationLevel);
        });
        console.log('🔄 Updated filtered subjects:', filtered.length);
        setFilteredSubjects(filtered);
      } else {
        setFilteredSubjects(subjects);
      }
    }
  }, [form.grade_level, subjects, gradeLevels]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'number') {
      setForm({ ...form, [name]: value === '' ? 0 : Number(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.checked });
  };

  const handleGradeLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const gradeLevelId = parseInt(e.target.value) || 0;
    
    if (exam) {
      setForm(prev => ({
        ...prev,
        grade_level: gradeLevelId,
      }));
    } else {
      setForm(prev => ({
        ...prev,
        grade_level: gradeLevelId,
        subject: 0,
      }));
    }
  };

  const handleObjectivesChange = (questions: ObjectiveQuestion[]) =>
    setForm((prev) => ({ ...prev, objective_questions: questions }));

  const handleTheoryChange = (questions: TheoryQuestion[]) =>
    setForm((prev) => ({ ...prev, theory_questions: questions }));

  const handlePracticalChange = (questions: PracticalQuestion[]) =>
    setForm((prev) => ({ ...prev, practical_questions: questions }));

  const handleCustomChange = (sections: CustomSection[]) =>
    setForm((prev) => ({ ...prev, custom_sections: sections }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.subject || form.subject === 0) {
      alert('Please select a subject');
      return;
    }
    
    if (!form.grade_level || form.grade_level === 0) {
      alert('Please select a grade level');
      return;
    }
    
    // Clean up the data before submission
    const cleanedData = { ...form };
    
    // Remove difficulty_level if it's empty string (backend doesn't accept empty string)
    if (!cleanedData.difficulty_level || cleanedData.difficulty_level.trim() === '') {
      delete (cleanedData as any).difficulty_level;
    }
    
    // Remove max_students if it's 0 or null (backend requires positive number or nothing)
    if (!cleanedData.max_students || cleanedData.max_students <= 0) {
      delete (cleanedData as any).max_students;
    }
    
    console.log('📤 Submitting cleaned form:', cleanedData);
    onSubmit(cleanedData);
  };

  if (!open) return null;

  if (backendDataLoading) {
    return (
      <div className="modal-overlay" style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div className="bg-white rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading form data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="modal-content" style={{ 
        backgroundColor: 'white', 
        borderRadius: 8, 
        maxHeight: "90vh", 
        overflowY: "auto", 
        width: "90vw", 
        maxWidth: 1200,
        padding: 24
      }}>
        <div className="modal-header" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24,
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: 16
        }}>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
            {exam ? "Edit" : "Create"} Exam
            {exam && <span style={{ fontSize: 14, color: '#6b7280', marginLeft: 8 }}>ID: {exam.id}</span>}
          </h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            style={{ 
              fontSize: 32, 
              border: 'none', 
              background: 'none', 
              cursor: 'pointer',
              color: '#6b7280',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        <div className="tab-navigation" style={{ 
          display: "flex", 
          gap: 8, 
          borderBottom: "2px solid #e5e7eb", 
          marginBottom: 24,
          flexWrap: 'wrap'
        }}>
          {[
            { key: "general", label: "General Info" },
            { key: "objectives", label: `Objectives (${form.objective_questions?.length || 0})` },
            { key: "theory", label: `Theory (${form.theory_questions?.length || 0})` },
            { key: "practical", label: `Practical (${form.practical_questions?.length || 0})` },
            { key: "custom", label: `Custom (${form.custom_sections?.length || 0})` }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: activeTab === tab.key ? '#3b82f6' : 'transparent',
                color: activeTab === tab.key ? 'white' : '#6b7280',
                cursor: 'pointer',
                borderRadius: '4px 4px 0 0',
                fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === "general" && (
            <div className="tab-content">
              <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 'bold' }}>Exam Information</h3>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Title *</label>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="Exam Title"
                  required
                  className="form-input"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Description</label>
                <RichTextEditor
                  value={form.description || ""}
                  onChange={(val) => setForm({ ...form, description: val })}
                  placeholder="Exam description..."
                />
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    Grade Level * 
                    {exam && form.grade_level > 0 && <span style={{ fontSize: 12, color: '#10b981', marginLeft: 8 }}>
                      ✓ Loaded: ID {form.grade_level}
                    </span>}
                  </label>
                  <select
                    name="grade_level"
                    value={form.grade_level}
                    onChange={handleGradeLevelChange}
                    required
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  >
                    <option value={0}>Select Grade Level</option>
                    {Array.isArray(gradeLevels) && gradeLevels.map(gradeLevel => (
                      <option key={gradeLevel.id} value={gradeLevel.id}>
                        {gradeLevel.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    Subject *
                    {exam && form.subject > 0 && <span style={{ fontSize: 12, color: '#10b981', marginLeft: 8 }}>
                      ✓ Loaded: ID {form.subject}
                    </span>}
                  </label>
                  <select
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    required
                    disabled={!form.grade_level}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  >
                    <option value={0}>Select Subject</option>
                    {Array.isArray(filteredSubjects) && filteredSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                  {!form.grade_level && (
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Please select a grade level first</p>
                  )}
                  {form.grade_level && filteredSubjects.length === 0 && (
                    <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>No subjects available for this grade level</p>
                  )}
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Type</label>
                  <input
                    name="exam_type"
                    value={form.exam_type || ""}
                    onChange={handleChange}
                    placeholder="e.g., Midterm, Final, Quiz"
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    Difficulty Level (Optional)
                  </label>
                  <select
                    name="difficulty_level"
                    value={form.difficulty_level || ""}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  >
                    <option value="">Not specified</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Leave empty if not applicable
                  </p>
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Exam Date</label>
                  <input
                    name="exam_date"
                    type="date"
                    value={form.exam_date || ""}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Start Time</label>
                  <input
                    name="start_time"
                    type="time"
                    value={form.start_time || ""}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>End Time</label>
                  <input
                    name="end_time"
                    type="time"
                    value={form.end_time || ""}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Duration (minutes)</label>
                  <input
                    name="duration_minutes"
                    type="number"
                    value={form.duration_minutes || 0}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Total Marks *</label>
                  <input
                    name="total_marks"
                    type="number"
                    value={form.total_marks || 0}
                    onChange={handleChange}
                    required
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Pass Marks</label>
                  <input
                    name="pass_marks"
                    type="number"
                    value={form.pass_marks || 0}
                    onChange={handleChange}
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Venue</label>
                  <input
                    name="venue"
                    value={form.venue || ""}
                    onChange={handleChange}
                    placeholder="Exam venue"
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    Max Students (Optional)
                  </label>
                  <input
                    name="max_students"
                    type="number"
                    min="1"
                    value={form.max_students || ""}
                    onChange={handleChange}
                    placeholder="Leave empty if unlimited"
                    className="form-input"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
                  />
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Must be a positive number or leave empty
                  </p>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Instructions</label>
                <RichTextEditor
                  value={form.instructions || ""}
                  onChange={(val) => setForm({ ...form, instructions: val })}
                  placeholder="General exam instructions..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Allowed</label>
                <RichTextEditor
                  value={form.materials_allowed || ""}
                  onChange={(val) => setForm({ ...form, materials_allowed: val })}
                  placeholder="Allowed materials..."
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Materials Provided</label>
                <RichTextEditor
                  value={form.materials_provided || ""}
                  onChange={(val) => setForm({ ...form, materials_provided: val })}
                  placeholder="Materials provided..."
                />
              </div>

              <div className="form-group" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    name="is_practical"
                    type="checkbox"
                    checked={form.is_practical || false}
                    onChange={handleCheckboxChange}
                  />
                  Is Practical
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    name="requires_computer"
                    type="checkbox"
                    checked={form.requires_computer || false}
                    onChange={handleCheckboxChange}
                  />
                  Requires Computer
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    name="is_online"
                    type="checkbox"
                    checked={form.is_online || false}
                    onChange={handleCheckboxChange}
                  />
                  Is Online
                </label>
              </div>
            </div>
          )}

          {activeTab === "objectives" && (
            <div className="tab-content">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Objective Instructions</label>
                <RichTextEditor
                  value={form.objective_instructions || ""}
                  onChange={(val) => setForm({ ...form, objective_instructions: val })}
                  placeholder="Instructions for objective section..."
                />
              </div>
              <QuestionSectionObjectives
                value={form.objective_questions ?? []}
                onChange={handleObjectivesChange}
              />
            </div>
          )}

          {activeTab === "theory" && (
            <div className="tab-content">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Theory Instructions</label>
                <RichTextEditor
                  value={form.theory_instructions || ""}
                  onChange={(val) => setForm({ ...form, theory_instructions: val })}
                  placeholder="Instructions for theory section..."
                />
              </div>
              <QuestionSectionTheory
                value={form.theory_questions ?? []}
                onChange={handleTheoryChange}
              />
            </div>
          )}

          {activeTab === "practical" && (
            <div className="tab-content">
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Practical Instructions</label>
                <RichTextEditor
                  value={form.practical_instructions || ""}
                  onChange={(val) => setForm({ ...form, practical_instructions: val })}
                  placeholder="Instructions for practical section..."
                />
              </div>
              <QuestionSectionPractical
                value={form.practical_questions ?? []}
                onChange={handlePracticalChange}
              />
            </div>
          )}

          {activeTab === "custom" && (
            <div className="tab-content">
              <QuestionSectionCustom
                value={form.custom_sections ?? []}
                onChange={handleCustomChange}
              />
            </div>
          )}

          <div className="modal-footer" style={{ 
            display: "flex",
            gap: 12, 
            justifyContent: "flex-end", 
            marginTop: 24, 
            borderTop: "2px solid #e5e7eb", 
            paddingTop: 16 
          }}>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn btn-secondary"
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                background: 'white',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              style={{
                padding: '10px 20px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              {exam ? "Save Changes" : "Create Exam"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExamFormModal;
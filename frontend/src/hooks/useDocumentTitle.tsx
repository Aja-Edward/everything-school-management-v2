// hooks/useDocumentTitle.ts
import { useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Custom hook to set and manage document title
 * @param title - The title to set for the document
 * @param restoreOnUnmount - Whether to restore the previous title when component unmounts
 * @param includeSchoolName - Whether to include the school name in the title
 */
export const useDocumentTitle = (
  title: string, 
  restoreOnUnmount: boolean = false,
  includeSchoolName: boolean = false
): void => {
  const prevTitleRef = useRef<string | undefined>(undefined);
  const { settings } = useSettings();

  useEffect(() => {
    // Store the previous title on first render
    if (prevTitleRef.current === undefined) {
      prevTitleRef.current = document.title;
    }

    // Set the new title with optional school name
    const fullTitle = includeSchoolName && settings?.school_name 
      ? `${title} - ${settings.school_name}`
      : title;
    
    document.title = fullTitle;

    // Cleanup function to restore previous title if needed
    return () => {
      if (restoreOnUnmount && prevTitleRef.current) {
        document.title = prevTitleRef.current;
      }
    };
  }, [title, restoreOnUnmount, includeSchoolName, settings?.school_name]);

  // Update the stored previous title when title changes
  useEffect(() => {
    return () => {
      prevTitleRef.current = document.title;
    };
  }, []);
};
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogIn, X } from 'lucide-react';

interface AuthLostModalProps {
  isOpen: boolean;
  onClose?: () => void;
  message?: string;
}

const AuthLostModal: React.FC<AuthLostModalProps> = ({ 
  isOpen, 
  onClose, 
  message = "Your session has expired. Please log in again to continue." 
}) => {
  const navigate = useNavigate();

  const handleRelogin = () => {
  // httpOnly cookies are cleared server-side
  // userData is cleared by the auth:expired event handler in useAuth
  if (onClose) onClose();
  navigate('/login', { replace: true });
};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in slide-in-from-bottom-4 duration-300">
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>
        
        {/* Title */}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center mb-2">
          Authentication Required
        </h2>
        
        {/* Message */}
        <p className="text-gray-600 dark:text-gray-300 text-center mb-6 leading-relaxed">
          {message}
        </p>
        
        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRelogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            Log In Again
          </button>
          
          {onClose && (
            <button
              onClick={onClose}
              className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 px-4 rounded-xl transition-colors duration-200"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthLostModal;



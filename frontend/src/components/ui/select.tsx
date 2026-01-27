import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

const sizeStyles = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
};

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  helperText,
  error,
  disabled = false,
  size = 'md',
  fullWidth = true,
  searchable = false,
  clearable = false,
  className = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  const selectedOption = options.find((opt) => opt.value === value);
  const hasError = Boolean(error);

  // Filter options based on search term
  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    } else if (e.key === 'Enter' && !isOpen) {
      setIsOpen(true);
    }
  };

  const baseStyles = [
    'w-full rounded-lg border bg-white cursor-pointer',
    'text-secondary-900',
    'transition-all duration-200',
    'focus:outline-none focus:ring-2',
    'disabled:bg-secondary-100 disabled:cursor-not-allowed disabled:text-secondary-500',
    'dark:bg-secondary-800 dark:text-secondary-100',
  ].join(' ');

  const stateStyles = hasError
    ? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
    : isOpen
    ? 'border-primary-500 ring-2 ring-primary-500/20'
    : 'border-secondary-300 hover:border-secondary-400 dark:border-secondary-600';

  const triggerClasses = [
    baseStyles,
    stateStyles,
    sizeStyles[size],
    'flex items-center justify-between gap-2',
    disabled && 'opacity-50 cursor-not-allowed',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const containerClasses = fullWidth ? 'w-full' : '';

  return (
    <div className={containerClasses} ref={containerRef}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          id={selectId}
          className={triggerClasses}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className={`flex-1 text-left truncate ${!selectedOption && 'text-secondary-400'}`}>
            {selectedOption?.label || placeholder}
          </span>

          <div className="flex items-center gap-1">
            {clearable && value && (
              <span
                onClick={handleClear}
                className="p-0.5 hover:bg-secondary-100 dark:hover:bg-secondary-700 rounded"
              >
                <X className="w-3.5 h-3.5 text-secondary-400" />
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-secondary-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg overflow-hidden animate-fade-in-down">
            {searchable && (
              <div className="p-2 border-b border-secondary-200 dark:border-secondary-700">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-3 py-1.5 text-sm bg-secondary-50 dark:bg-secondary-700 border border-secondary-200 dark:border-secondary-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            )}

            <ul
              className="max-h-60 overflow-y-auto py-1 scrollbar-thin"
              role="listbox"
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-secondary-500 dark:text-secondary-400">
                  No options found
                </li>
              ) : (
                filteredOptions.map((option) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    className={`
                      flex items-center justify-between px-3 py-2 text-sm cursor-pointer
                      transition-colors duration-150
                      ${
                        option.value === value
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-700'
                      }
                      ${option.disabled && 'opacity-50 cursor-not-allowed'}
                    `}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                  >
                    <span>{option.label}</span>
                    {option.value === value && (
                      <Check className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {(error || helperText) && (
        <p
          className={`mt-1.5 text-xs ${
            hasError
              ? 'text-error-600 dark:text-error-400'
              : 'text-secondary-500 dark:text-secondary-400'
          }`}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
};

// Native Select for simpler use cases
export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
  helperText?: string;
  error?: string;
  selectSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      options,
      label,
      helperText,
      error,
      selectSize = 'md',
      fullWidth = true,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const selectId = id || `native-select-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = Boolean(error);

    const baseStyles = [
      'w-full rounded-lg border bg-white cursor-pointer appearance-none',
      'text-secondary-900',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2',
      'disabled:bg-secondary-100 disabled:cursor-not-allowed disabled:text-secondary-500',
      'dark:bg-secondary-800 dark:text-secondary-100',
      'bg-no-repeat bg-right',
    ].join(' ');

    const stateStyles = hasError
      ? 'border-error-500 focus:ring-error-500/20 focus:border-error-500'
      : 'border-secondary-300 focus:ring-primary-500/20 focus:border-primary-500 dark:border-secondary-600';

    const selectClasses = [
      baseStyles,
      stateStyles,
      sizeStyles[selectSize],
      'pr-10',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const containerClasses = fullWidth ? 'w-full' : '';

    return (
      <div className={containerClasses}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1.5"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={selectClasses}
            disabled={disabled}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 0.5rem center',
              backgroundSize: '1.5em 1.5em',
            }}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {(error || helperText) && (
          <p
            className={`mt-1.5 text-xs ${
              hasError
                ? 'text-error-600 dark:text-error-400'
                : 'text-secondary-500 dark:text-secondary-400'
            }`}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

NativeSelect.displayName = 'NativeSelect';

// Legacy exports for backward compatibility
export const SelectTrigger: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = '',
  onClick
}) => (
  <button
    type="button"
    className={`flex h-9 w-full items-center justify-between rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:bg-secondary-800 dark:border-secondary-600 dark:text-secondary-100 ${className}`}
    onClick={onClick}
  >
    {children}
    <ChevronDown className="h-4 w-4 text-secondary-400" />
  </button>
);

export const SelectValue: React.FC<{ placeholder?: string; className?: string }> = ({
  placeholder,
  className = ''
}) => (
  <span className={`text-secondary-500 ${className}`}>
    {placeholder}
  </span>
);

export const SelectContent: React.FC<{ children: React.ReactNode; className?: string; isOpen?: boolean }> = ({
  children,
  className = '',
  isOpen = false
}) => {
  if (!isOpen) return null;
  return (
    <div className={`absolute top-full z-50 mt-1 w-full rounded-lg border border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 p-1 shadow-lg animate-fade-in-down ${className}`}>
      {children}
    </div>
  );
};

export const SelectItem: React.FC<{ value: string; children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = '',
  onClick
}) => (
  <button
    type="button"
    className={`relative flex w-full items-center rounded-md px-3 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors ${className}`}
    onClick={onClick}
  >
    {children}
  </button>
);

export default Select;

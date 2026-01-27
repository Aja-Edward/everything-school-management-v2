import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles = {
  default: 'bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 shadow-sm',
  bordered: 'bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700',
  elevated: 'bg-white dark:bg-secondary-800 shadow-md dark:shadow-dark-md',
  interactive: [
    'bg-white dark:bg-secondary-800',
    'border border-secondary-200 dark:border-secondary-700',
    'shadow-sm hover:shadow-md',
    'transition-all duration-200',
    'hover:-translate-y-0.5',
    'cursor-pointer',
  ].join(' '),
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'none', className = '', children, ...props }, ref) => {
    const classes = [
      'rounded-xl',
      variantStyles[variant],
      paddingStyles[padding],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = '', children, actions, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-between px-5 py-4 border-b border-secondary-200 dark:border-secondary-700 ${className}`}
        {...props}
      >
        <div className="flex-1">{children}</div>
        {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

// Card Title
export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Component = 'h3', className = '', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={`text-base font-semibold text-secondary-900 dark:text-white ${className}`}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

CardTitle.displayName = 'CardTitle';

// Card Description
export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={`text-sm text-secondary-500 dark:text-secondary-400 mt-1 ${className}`}
        {...props}
      >
        {children}
      </p>
    );
  }
);

CardDescription.displayName = 'CardDescription';

// Card Content
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ padding = 'md', className = '', children, ...props }, ref) => {
    const paddingClasses = {
      none: '',
      sm: 'px-4 py-3',
      md: 'px-5 py-4',
      lg: 'px-6 py-5',
    };

    return (
      <div ref={ref} className={`${paddingClasses[padding]} ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

// Card Footer
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'left' | 'center' | 'right' | 'between';
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ align = 'right', className = '', children, ...props }, ref) => {
    const alignClasses = {
      left: 'justify-start',
      center: 'justify-center',
      right: 'justify-end',
      between: 'justify-between',
    };

    return (
      <div
        ref={ref}
        className={`flex items-center gap-3 px-5 py-4 border-t border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50 rounded-b-xl ${alignClasses[align]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

export default Card;

/**
 * ============================================================================
 * UpgradePrompt.tsx
 * Component for prompting users to upgrade/pay for a feature
 * ============================================================================
 */

import React, { useState } from 'react';
import { Lock, CheckCircle, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// TYPES
// ============================================================================

interface UpgradePromptProps {
  featureId: string;
  featureName: string;
  academicSessionId?: string;
  termId?: string;
  className?: string;
}

// Feature descriptions and benefits
const FEATURE_INFO: Record<string, {
  title: string;
  description: string;
  benefits: string[];
  pricePerStudent: number;
}> = {
  exams: {
    title: 'Exams & Results',
    description: 'Create and manage exams, record student results, and generate comprehensive report cards.',
    benefits: [
      'Create and manage exams',
      'Record student results',
      'Generate result reports',
      'Automated grade calculation',
      'Result analytics',
    ],
    pricePerStudent: 700,
  },
  attendance: {
    title: 'Attendance Management',
    description: 'Track student attendance with automated alerts and comprehensive reporting.',
    benefits: [
      'Daily attendance tracking',
      'Automated absence alerts',
      'Attendance analytics',
      'Parent notifications',
      'Attendance reports',
    ],
    pricePerStudent: 200,
  },
  messaging: {
    title: 'Messaging System',
    description: 'Communicate effectively with students, parents, and teachers through our messaging platform.',
    benefits: [
      'Direct messaging',
      'Bulk announcements',
      'SMS notifications',
      'Email integration',
      'Message history',
    ],
    pricePerStudent: 150,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * UpgradePrompt component to show when a feature is not accessible
 */
export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  featureId,
  featureName,
  className = '',
}) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const featureInfo = FEATURE_INFO[featureId] || {
    title: featureName,
    description: `Access ${featureName} functionality to enhance your school management.`,
    benefits: [
      `Full ${featureName} access`,
      'Unlimited usage',
      'Priority support',
    ],
    pricePerStudent: 0,
  };

  const handleUpgrade = () => {
    // Navigate to billing page to generate invoice
    navigate('/admin/billing/generate-invoice', {
      state: { selectedFeature: featureId },
    });
  };

  return (
    <div className={`flex items-center justify-center min-h-[400px] p-4 ${className}`}>
      <Card
        className={`max-w-2xl w-full transition-all duration-300 ${
          isHovered ? 'shadow-2xl scale-105' : 'shadow-lg'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-6 rounded-full">
              <Lock className="h-12 w-12 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {featureInfo.title}
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            {featureInfo.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Benefits List */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              Unlock these features:
            </h3>
            <ul className="space-y-2">
              {featureInfo.benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pricing */}
          {featureInfo.pricePerStudent > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Starting from</p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    ₦{featureInfo.pricePerStudent.toLocaleString()}
                  </span>
                  <span className="text-gray-600">per student / term</span>
                </div>
              </div>
            </div>
          )}

          {/* Additional Info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Features are charged per enrolled student for each academic term.
              Payment activates the feature immediately.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-6">
          <Button
            onClick={handleUpgrade}
            size="lg"
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-6 text-lg"
          >
            <CreditCard className="mr-2 h-5 w-5" />
            Upgrade Now
          </Button>
          <p className="text-xs text-gray-500 text-center">
            Instant activation • Secure payment • Cancel anytime
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default UpgradePrompt;

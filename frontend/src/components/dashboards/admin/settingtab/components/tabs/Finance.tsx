import React, { useState } from 'react';
import { 
  DollarSign, 
  CreditCard, 
  Receipt, 
  Calculator, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Calendar,
  Plus,
  Edit3,
  Trash2,
  Save,
  X
} from 'lucide-react';
import ToggleSwitch from '@/components/dashboards/admin/settingtab/components/ToggleSwitch';
import FeeRemindersPanel from './FeeRemindersPanel';

const Finance: React.FC = () => {
  const [feeStructure] = useState([
    {
      id: 1,
      name: 'Tuition Fee',
      amount: 5000,
      frequency: 'monthly',
      description: 'Standard tuition fee for all students',
      isActive: true
    },
    {
      id: 2,
      name: 'Library Fee',
      amount: 200,
      frequency: 'yearly',
      description: 'Annual library membership fee',
      isActive: true
    }
  ]);

  const [discountRules] = useState([
    {
      id: 1,
      name: 'Sibling Discount',
      type: 'percentage',
      value: 10,
      description: '10% discount for siblings',
      isActive: true
    },
    {
      id: 2,
      name: 'Early Payment',
      type: 'percentage',
      value: 5,
      description: '5% discount for early payment',
      isActive: true
    }
  ]);

  const [reminderSettings, setReminderSettings] = useState({
    enableReminders: true,
    reminderDays: 7,
    autoReminders: true,
    emailNotifications: true,
    smsNotifications: false
  });

  const [paymentMethods, setPaymentMethods] = useState([
    { id: 1, name: 'Credit Card', enabled: true, processingFee: 2.5 },
    { id: 2, name: 'Bank Transfer', enabled: true, processingFee: 0 },
    { id: 3, name: 'Cash', enabled: true, processingFee: 0 },
    { id: 4, name: 'Mobile Money', enabled: false, processingFee: 1.5 }
  ]);

  const [taxSettings, setTaxSettings] = useState({
    enableTax: true,
    taxRate: 15,
    taxName: 'VAT',
    taxNumber: 'TAX123456'
  });

  const updatePaymentMethod = (id: number, field: string, value: any) => {
    setPaymentMethods(prev => prev.map(method => 
      method.id === id ? { ...method, [field]: value } : method
    ));
  };

  const updateReminderSettings = (field: string, value: any) => {
    setReminderSettings(prev => ({ ...prev, [field]: value }));
  };

  const updateTaxSettings = (field: string, value: any) => {
    setTaxSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-8">
      <FeeRemindersPanel />

      {/* Fee Structure Management */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            Fee Structure Management
          </h3>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Plus className="w-4 h-4" />
            Add Fee Item
          </button>
        </div>

        <div className="space-y-4">
          {feeStructure.map(fee => (
            <div key={fee.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900">{fee.name}</h4>
                <p className="text-sm text-slate-600">{fee.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-lg font-bold text-green-600">${fee.amount}</span>
                  <span className="text-sm text-slate-500 capitalize">{fee.frequency}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    fee.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {fee.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-600 hover:text-slate-800 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-600 hover:text-red-800 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Discount Rules */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <Calculator className="w-4 h-4 text-white" />
            </div>
            Discount Rules
          </h3>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            Add Discount
          </button>
        </div>

        <div className="space-y-4">
          {discountRules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900">{rule.name}</h4>
                <p className="text-sm text-slate-600">{rule.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-lg font-bold text-blue-600">{rule.value}%</span>
                  <span className="text-sm text-slate-500 capitalize">{rule.type}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    rule.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-600 hover:text-slate-800 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-600 hover:text-red-800 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-white" />
          </div>
          Payment Methods
        </h3>

        <div className="space-y-4">
          {paymentMethods.map(method => (
            <div key={method.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900">{method.name}</h4>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-sm text-slate-600">
                    Processing Fee: {method.processingFee}%
                  </span>
                  <ToggleSwitch
                    id={`payment-${method.id}`}
                    checked={method.enabled}
                    onChange={(checked) => updatePaymentMethod(method.id, 'enabled', checked)}
                    label=""
                    description=""
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reminder Settings */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          Reminder Settings
        </h3>

        <div className="space-y-6">
          <ToggleSwitch
            id="enable-reminders"
            checked={reminderSettings.enableReminders}
            onChange={(checked) => updateReminderSettings('enableReminders', checked)}
            label="Enable Payment Reminders"
            description="Send automatic reminders for upcoming payments"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Reminder Days Before Due Date
            </label>
            <input
              type="number"
              value={reminderSettings.reminderDays}
              onChange={(e) => updateReminderSettings('reminderDays', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              min="1"
              max="30"
            />
          </div>

          <ToggleSwitch
            id="auto-reminders"
            checked={reminderSettings.autoReminders}
            onChange={(checked) => updateReminderSettings('autoReminders', checked)}
            label="Automatic Reminders"
            description="Send reminders automatically without manual intervention"
          />

          <ToggleSwitch
            id="email-notifications"
            checked={reminderSettings.emailNotifications}
            onChange={(checked) => updateReminderSettings('emailNotifications', checked)}
            label="Email Notifications"
            description="Send payment reminders via email"
          />

          <ToggleSwitch
            id="sms-notifications"
            checked={reminderSettings.smsNotifications}
            onChange={(checked) => updateReminderSettings('smsNotifications', checked)}
            label="SMS Notifications"
            description="Send payment reminders via SMS"
          />
        </div>
      </div>

      {/* Tax Settings */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          Tax Settings
        </h3>

        <div className="space-y-6">
          <ToggleSwitch
            id="enable-tax"
            checked={taxSettings.enableTax}
            onChange={(checked) => updateTaxSettings('enableTax', checked)}
            label="Enable Tax"
            description="Apply tax to all transactions"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tax Rate (%)
              </label>
              <input
                type="number"
                value={taxSettings.taxRate}
                onChange={(e) => updateTaxSettings('taxRate', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min="0"
                max="100"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tax Name
              </label>
              <input
                type="text"
                value={taxSettings.taxName}
                onChange={(e) => updateTaxSettings('taxName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., VAT, GST"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tax Number
            </label>
            <input
              type="text"
              value={taxSettings.taxNumber}
              onChange={(e) => updateTaxSettings('taxNumber', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Tax registration number"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Finance;
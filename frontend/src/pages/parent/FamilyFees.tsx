import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, CreditCard, Printer, Receipt, Wallet, X } from 'lucide-react';
import api from '@/services/api';
import { formatCurrency } from '@/services/BillingService';
import { toast } from 'react-toastify';

interface BillLine {
  id: number;
  name: string;
  fee_type: string;
  amount_due: string;
  discount: string;
  paid: string;
  balance: string;
  status: string;
  due_date: string;
}

interface PaidReceipt {
  reference: string;
  receipt_number: string;
  paid_at: string;
  amount: string;
}

interface TermBill {
  academic_session_id: number;
  academic_session: string;
  term: string;
  term_display: string;
  items: BillLine[];
  total_due: string;
  discount: string;
  paid: string;
  balance: string;
  due_date: string;
  is_overdue: boolean;
  receipts: PaidReceipt[];
}

interface ChildBills {
  student_id: number;
  student: string;
  student_class: string | null;
  bills: TermBill[];
}

interface FamilyBills {
  can_pay_online: boolean;
  children: ChildBills[];
}

interface ReceiptDetail {
  receipt_number: string;
  reference: string;
  school: string;
  student: string;
  academic_session: string;
  term: string;
  paid_at: string;
  payer_name: string | null;
  payer_email: string | null;
  method: string;
  card_last_four: string | null;
  lines: Array<{ name: string; amount: string }>;
  total: string;
}

const FAMILY_FEES = '/api/fee/family-fees/';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });

// Paystack sends the parent back here with ?reference=… once they have paid.
const returnedReference = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('reference') || params.get('trxref');
};

const printReceipt = (receipt: ReceiptDetail) => {
  const rows = receipt.lines
    .map(l => `<tr><td>${l.name}</td><td style="text-align:right">${formatCurrency(l.amount)}</td></tr>`)
    .join('');
  const page = window.open('', '_blank', 'width=640,height=800');
  if (!page) return;
  page.document.write(`<!doctype html><title>Receipt ${receipt.receipt_number}</title>
    <style>body{font-family:system-ui,sans-serif;margin:40px;color:#111}table{width:100%;border-collapse:collapse}
    td{padding:8px 0;border-bottom:1px solid #ddd}h1{font-size:20px;margin:0}p{margin:4px 0;color:#444}
    .total td{font-weight:700;border-bottom:none}</style>
    <h1>${receipt.school}</h1><p>Payment receipt ${receipt.receipt_number}</p><br>
    <p><b>Student:</b> ${receipt.student}</p>
    <p><b>Term:</b> ${receipt.term}, ${receipt.academic_session}</p>
    <p><b>Paid:</b> ${formatDate(receipt.paid_at)} by ${receipt.method}${receipt.card_last_four ? ` ending ${receipt.card_last_four}` : ''}</p>
    ${receipt.payer_name ? `<p><b>Paid by:</b> ${receipt.payer_name}</p>` : ''}
    <p><b>Reference:</b> ${receipt.reference}</p><br>
    <table>${rows}<tr class="total"><td>Total paid</td><td style="text-align:right">${formatCurrency(receipt.total)}</td></tr></table>`);
  page.document.close();
  page.focus();
  page.print();
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'PAID':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
    case 'PARTIAL':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Part paid</Badge>;
    case 'OVERDUE':
      return <Badge variant="destructive">Overdue</Badge>;
    default:
      return <Badge variant="outline">Unpaid</Badge>;
  }
};

interface FamilyFeesProps {
  studentId: number;
}

const FamilyFees = ({ studentId }: FamilyFeesProps) => {
  const [data, setData] = useState<FamilyBills | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get(FAMILY_FEES));
    } catch (error: any) {
      toast.error(error?.message || 'Could not load fees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const reference = returnedReference();
    if (!reference) {
      load();
      return;
    }
    // Back from Paystack: ask the school's account what happened, then drop
    // the reference from the address so a refresh doesn't ask again.
    setChecking(true);
    api.post(`${FAMILY_FEES}verify/`, { reference })
      .then((result: any) => {
        if (result.status === 'paid' && result.receipt) {
          setReceipt(result.receipt);
          toast.success('Payment received. Thank you!');
        } else if (result.status === 'abandoned' || result.status === 'ongoing') {
          toast.info('The payment was not completed. Nothing was charged.');
        } else {
          toast.error(result.message || 'The payment did not go through.');
        }
      })
      .catch((error: any) => toast.error(error?.message || 'Could not confirm the payment'))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('reference');
        url.searchParams.delete('trxref');
        window.history.replaceState({}, '', url.toString());
        setChecking(false);
        load();
      });
  }, [load]);

  const pay = async (bill: TermBill) => {
    const key = `${bill.academic_session_id}-${bill.term}`;
    setPaying(key);
    try {
      const callback = new URL('/parent/dashboard', window.location.origin);
      callback.searchParams.set('tab', 'fees');
      const started: any = await api.post(`${FAMILY_FEES}pay/`, {
        student_id: studentId,
        academic_session_id: bill.academic_session_id,
        term: bill.term,
        callback_url: callback.toString(),
      });
      window.location.href = started.authorization_url;
    } catch (error: any) {
      toast.error(error?.message || 'Could not start the payment');
      setPaying(null);
    }
  };

  const openReceipt = async (reference: string) => {
    try {
      setReceipt(await api.get(`${FAMILY_FEES}receipt/`, { reference }));
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the receipt');
    }
  };

  if (loading || checking) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-600 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          {checking ? 'Confirming your payment with Paystack…' : 'Loading fees…'}
        </CardContent>
      </Card>
    );
  }

  const child = data?.children.find(c => c.student_id === studentId);
  const bills = child?.bills ?? [];

  return (
    <div className="space-y-6">
      {!data?.can_pay_online && bills.some(b => Number(b.balance) > 0) && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The school hasn't set up online payment yet. Please pay at the school's bursary for now.
          </AlertDescription>
        </Alert>
      )}

      {bills.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No fees have been issued for {child?.student ?? 'this child'} yet.</p>
          </CardContent>
        </Card>
      )}

      {bills.map(bill => {
        const key = `${bill.academic_session_id}-${bill.term}`;
        const owed = Number(bill.balance) > 0;
        return (
          <Card key={key}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    {bill.term_display}, {bill.academic_session}
                  </CardTitle>
                  <CardDescription>
                    {owed
                      ? `Due ${formatDate(bill.due_date)}`
                      : 'Fully paid'}
                  </CardDescription>
                </div>
                {owed ? (
                  bill.is_overdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="outline">Outstanding</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    <CheckCircle className="w-3 h-3 mr-1" /> Paid
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {bill.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                      {Number(item.discount) > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(item.discount)} off {formatCurrency(item.amount_due)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {statusBadge(item.status)}
                      <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(Number(item.amount_due) - Number(item.discount))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 space-y-1 text-sm">
                {Number(bill.paid) > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Already paid</span>
                    <span className="tabular-nums">{formatCurrency(bill.paid)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold text-gray-900 dark:text-white">
                  <span>{owed ? 'To pay' : 'Balance'}</span>
                  <span className="tabular-nums">{formatCurrency(bill.balance)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {bill.receipts.map(r => (
                    <Button key={r.reference} variant="outline" size="sm" onClick={() => openReceipt(r.reference)}>
                      <Receipt className="w-4 h-4 mr-1" />
                      {r.receipt_number} · {formatCurrency(r.amount)}
                    </Button>
                  ))}
                </div>
                {owed && data?.can_pay_online && (
                  <Button onClick={() => pay(bill)} disabled={paying !== null}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    {paying === key ? 'Opening Paystack…' : `Pay ${formatCurrency(bill.balance)}`}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" /> Payment received
                  </CardTitle>
                  <CardDescription>Receipt {receipt.receipt_number}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setReceipt(null)} aria-label="Close">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-1 text-gray-600 dark:text-gray-400">
                <p><span className="text-gray-900 dark:text-white font-medium">{receipt.student}</span></p>
                <p>{receipt.term}, {receipt.academic_session}</p>
                <p>
                  {formatDate(receipt.paid_at)} · {receipt.method}
                  {receipt.card_last_four ? ` ending ${receipt.card_last_four}` : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {receipt.lines.map(line => (
                  <div key={line.name} className="flex justify-between py-2">
                    <span>{line.name}</span>
                    <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-semibold text-gray-900 dark:text-white">
                  <span>Total paid</span>
                  <span className="tabular-nums">{formatCurrency(receipt.total)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 break-all">Reference {receipt.reference}</p>
              <Button className="w-full" variant="outline" onClick={() => printReceipt(receipt)}>
                <Printer className="w-4 h-4 mr-2" /> Print receipt
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default FamilyFees;

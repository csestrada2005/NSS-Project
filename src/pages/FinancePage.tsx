import { CreditCard, ArrowUpRight, DollarSign, Wallet, AlertCircle, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Invoice {
  id: string;
  client: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  date: string;
}

const mockInvoices: Invoice[] = [
  { id: 'INV-1021', client: 'Acme Corp', amount: 3500.00, status: 'Paid', date: 'Oct 05, 2023' },
  { id: 'INV-1022', client: 'Globex Inc', amount: 4250.00, status: 'Pending', date: 'Oct 10, 2023' },
  { id: 'INV-1023', client: 'Initech', amount: 1200.50, status: 'Overdue', date: 'Sep 25, 2023' },
  { id: 'INV-1024', client: 'Umbrella Corp', amount: 8400.00, status: 'Paid', date: 'Oct 15, 2023' },
  { id: 'INV-1025', client: 'Stark Industries', amount: 15500.00, status: 'Pending', date: 'Oct 18, 2023' },
];

const getStatusBadge = (status: Invoice['status']) => {
  switch (status) {
    case 'Paid':
      return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">Paid</Badge>;
    case 'Pending':
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20">Pending</Badge>;
    case 'Overdue':
      return <Badge variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20">Overdue</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const FinancePage = () => {
  const totalRevenue = mockInvoices.filter(inv => inv.status === 'Paid').reduce((acc, curr) => acc + curr.amount, 0);
  const pendingPayments = mockInvoices.filter(inv => inv.status === 'Pending').reduce((acc, curr) => acc + curr.amount, 0);
  const overdueAmount = mockInvoices.filter(inv => inv.status === 'Overdue').reduce((acc, curr) => acc + curr.amount, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Finances</h1>
          <p className="text-muted-foreground mt-1">Track your revenue, invoices, and payments.</p>
        </div>
        <Button className="gap-2">
          <CreditCard className="w-4 h-4" />
          Create Invoice
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-500">+12%</span> from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <Wallet className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(pendingPayments)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Waiting to be cleared
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overdueAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Needs immediate attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.id}</TableCell>
                  <TableCell className="text-muted-foreground">{invoice.client}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{invoice.date}</TableCell>
                  <TableCell className="w-[50px]">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancePage;

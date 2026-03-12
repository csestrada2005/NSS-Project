import { useAuth } from '@/contexts/AuthContext';
import StaffFinance from './finance/StaffFinance';
import ClientFinance from './finance/ClientFinance';

const FinancePage = () => {
  const { isCliente, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="w-6 h-6 border-2 border-muted border-t-muted-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (isCliente) {
    return <ClientFinance />;
  }

  return <StaffFinance />;
};

export default FinancePage;

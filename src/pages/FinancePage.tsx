import { useAuth } from '@/contexts/AuthContext';
import StaffFinance from './finance/StaffFinance';
import ClientFinance from './finance/ClientFinance';
import LoadingSquares from '../components/brand/LoadingSquares';

const FinancePage = () => {
  const { isCliente, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSquares size={40} />
      </div>
    );
  }

  if (isCliente) {
    return <ClientFinance />;
  }

  return <StaffFinance />;
};

export default FinancePage;

import { useAuth } from '@/contexts/AuthContext';
import StaffFinance from './finance/StaffFinance';
import ClientFinance from './finance/ClientFinance';
import NebuLoader from '../components/brand/NebuLoader';

const FinancePage = () => {
  const { isCliente, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <NebuLoader size={140} />
      </div>
    );
  }

  if (isCliente) {
    return <ClientFinance />;
  }

  return <StaffFinance />;
};

export default FinancePage;

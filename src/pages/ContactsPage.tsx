import { useAuth } from '@/contexts/AuthContext';
import StaffContacts from './contacts/StaffContacts';
import ClientContactView from './contacts/ClientContactView';
import LoadingSquares from '../components/brand/LoadingSquares';

const ContactsPage = () => {
  const { isCliente, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSquares size={40} />
      </div>
    );
  }

  if (isCliente) {
    return <ClientContactView />;
  }

  return <StaffContacts />;
};

export default ContactsPage;
